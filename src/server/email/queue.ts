import os from 'node:os';
import { Prisma, type EmailJob } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit, systemActor, type AuditActor } from '@/lib/audit';
import { env } from '@/lib/env';
import { Errors } from '@/lib/errors';
import { maskEmail } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { getFile } from '@/lib/storage';
import { EmailSendError, getEmailProvider, isValidEmail } from './providers';
import { receiptEmail } from './templates';

/** Esperas entre reintentos (minutos) para errores transitorios. */
export const RETRY_BACKOFF_MIN = [1, 5, 15, 60, 240];
export const DEFAULT_MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MIN = 10;
const WORKER_ID = `${os.hostname()}:${process.pid}`;

type Tx = Prisma.TransactionClient;

/** Encola el comprobante de un participante. La clave de idempotencia evita envíos duplicados. */
export async function enqueueReceiptEmail(
  tx: Tx,
  p: { eventId: string; recordId: string; documentId: string; recipient: string; eventName: string; manual?: { userId: string; n: number } },
) {
  const key = p.manual ? `RECEIPT_EMAIL:${p.recordId}:R${p.manual.n}` : `RECEIPT_EMAIL:${p.recordId}`;
  const res = await tx.emailJob.createMany({
    data: [
      {
        idempotencyKey: key,
        type: 'RECEIPT',
        eventId: p.eventId,
        attendanceRecordId: p.recordId,
        documentId: p.documentId,
        recipient: p.recipient,
        subject: `Comprobante de asistencia - ${p.eventName}`,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        isManualResend: Boolean(p.manual),
        requestedById: p.manual?.userId ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return { created: res.count === 1, key };
}

/** Reclama trabajos pendientes con bloqueo (FOR UPDATE SKIP LOCKED): seguro con varios workers. */
async function claimJobs(limit: number): Promise<EmailJob[]> {
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE email_jobs SET locked_at = now(), locked_by = ${WORKER_ID}
    WHERE id IN (
      SELECT id FROM email_jobs
      WHERE status IN ('PENDING', 'RETRYING')
        AND next_attempt_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - (${LOCK_TIMEOUT_MIN} * interval '1 minute'))
      ORDER BY next_attempt_at ASC, created_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (ids.length === 0) return [];
  return prisma.emailJob.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
}

async function logNotification(job: EmailJob, status: string, extra: { provider?: string; messageId?: string; error?: string } = {}) {
  await prisma.notificationLog.create({
    data: {
      emailJobId: job.id,
      channel: 'EMAIL',
      kind: job.type,
      recipientMasked: maskEmail(job.recipient),
      status,
      provider: extra.provider ?? null,
      providerMessageId: extra.messageId ?? null,
      error: extra.error?.slice(0, 1000) ?? null,
      details: { attempt: job.attempts + 1 },
    },
  });
}

async function processJob(job: EmailJob) {
  const finish = (data: Prisma.EmailJobUpdateInput) =>
    prisma.emailJob.update({ where: { id: job.id }, data: { ...data, lockedAt: null, lockedBy: null } });

  // Control de duplicados: si otro trabajo automático del mismo registro ya fue enviado, no se reenvía.
  if (!job.isManualResend && job.attendanceRecordId) {
    const dup = await prisma.emailJob.findFirst({
      where: { attendanceRecordId: job.attendanceRecordId, id: { not: job.id }, isManualResend: false, status: { in: ['SENT_TO_PROVIDER', 'DELIVERED'] } },
    });
    if (dup) {
      await logNotification(job, 'CANCELLED', { error: `Duplicado del trabajo ${dup.id}` });
      return finish({ status: 'CANCELLED', lastError: 'Duplicado: el comprobante ya había sido enviado.' });
    }
  }

  if (!isValidEmail(job.recipient)) {
    await logNotification(job, 'REJECTED', { error: 'Dirección de correo inválida' });
    return finish({ status: 'REJECTED', attempts: job.attempts + 1, lastError: 'Dirección de correo inválida.' });
  }

  const provider = getEmailProvider();
  try {
    const [doc, rec, settings] = await Promise.all([
      job.documentId ? prisma.document.findUnique({ where: { id: job.documentId } }) : null,
      job.attendanceRecordId ? prisma.attendanceRecord.findUnique({ where: { id: job.attendanceRecordId }, include: { attendee: true, event: true } }) : null,
      getSettings(),
    ]);
    if (!doc || !rec) throw new EmailSendError('Documento o registro asociado no encontrado', true);
    if (rec.status !== 'COMPLETED') throw new EmailSendError('El registro no tiene firma completa', true);
    const pdf = await getFile(doc.storagePath);
    const tpl = receiptEmail({ participantName: rec.attendee.fullName, eventName: rec.event.name, companyName: settings.companyName });
    const result = await provider.send({
      to: job.recipient,
      ...tpl,
      attachments: [{ filename: `Comprobante_${rec.evidenceCode}.pdf`, content: pdf, contentType: 'application/pdf' }],
      idempotencyKey: job.idempotencyKey,
    });
    await logNotification(job, 'SENT_TO_PROVIDER', { provider: result.provider, messageId: result.messageId });
    // Importante: "SENT_TO_PROVIDER" significa aceptado por el proveedor, no recibido por el destinatario.
    return finish({
      status: 'SENT_TO_PROVIDER',
      attempts: job.attempts + 1,
      sentAt: new Date(),
      provider: result.provider,
      providerMessageId: result.messageId,
      lastError: null,
    });
  } catch (e) {
    const err = e instanceof EmailSendError ? e : new EmailSendError((e as Error).message ?? 'Error desconocido', false);
    const attempts = job.attempts + 1;
    if (err.permanent) {
      await logNotification(job, 'REJECTED', { provider: provider.name, error: err.message });
      return finish({ status: 'REJECTED', attempts, lastError: err.message.slice(0, 1000), provider: provider.name });
    }
    if (attempts >= job.maxAttempts) {
      await logNotification(job, 'FAILED', { provider: provider.name, error: err.message });
      return finish({ status: 'FAILED', attempts, lastError: err.message.slice(0, 1000), provider: provider.name });
    }
    const waitMin = RETRY_BACKOFF_MIN[Math.min(attempts - 1, RETRY_BACKOFF_MIN.length - 1)];
    await logNotification(job, 'RETRYING', { provider: provider.name, error: err.message });
    return finish({
      status: 'RETRYING',
      attempts,
      lastError: err.message.slice(0, 1000),
      provider: provider.name,
      nextAttemptAt: new Date(Date.now() + waitMin * 60_000),
    });
  }
}

/** Procesa un lote de la cola. Devuelve cuántos trabajos se procesaron. */
export async function processEmailQueue(opts: { batch?: number; maxBatches?: number } = {}) {
  const batch = opts.batch ?? 10;
  let total = 0;
  for (let i = 0; i < (opts.maxBatches ?? 50); i++) {
    const jobs = await claimJobs(batch);
    if (jobs.length === 0) break;
    for (const j of jobs) {
      await processJob(j);
      total++;
    }
  }
  return total;
}

let running: Promise<number> | null = null;
function runInBackground() {
  if (running) return running;
  running = processEmailQueue()
    .catch((e) => {
      console.error('[email-queue] error', e);
      return 0;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/**
 * Dispara el procesamiento de la cola sin bloquear la respuesta (modo QUEUE_INLINE).
 * Dentro de una petición usa `after()` de Next.js: en entornos serverless (Vercel) la función
 * permanece activa hasta terminar el envío. Fuera de una petición (worker, pruebas) se ejecuta en segundo plano.
 */
export async function kickEmailQueue() {
  if (!env.queueInline) return;
  try {
    const { after } = await import('next/server');
    after(() => runInBackground());
  } catch {
    void runInBackground();
  }
}

/** Reenvío manual (solo ADMIN): crea un nuevo trabajo conservando el historial. */
export async function resendReceipt(recordId: string, actor: AuditActor & { userId: string }, recipientOverride?: string | null) {
  const rec = await prisma.attendanceRecord.findUnique({ where: { id: recordId }, include: { attendee: true, event: true } });
  if (!rec) throw Errors.notFound('Registro');
  if (rec.status !== 'COMPLETED') throw Errors.conflict('NOT_SIGNED', 'Solo se envían comprobantes a participantes con firma completa.');
  const doc = await prisma.document.findFirst({ where: { attendanceRecordId: rec.id, type: 'RECEIPT' } });
  if (!doc) throw Errors.conflict('NO_RECEIPT', 'El comprobante aún no ha sido generado (se genera al cerrar el evento).');
  const recipient = (recipientOverride || rec.attendee.email).trim();
  if (!isValidEmail(recipient)) throw Errors.badRequest('Dirección de correo inválida.');
  const active = await prisma.emailJob.findFirst({ where: { attendanceRecordId: rec.id, status: { in: ['PENDING', 'RETRYING'] } } });
  if (active) throw Errors.conflict('ALREADY_QUEUED', 'Ya hay un envío en cola para este participante.');
  const n = (await prisma.emailJob.count({ where: { attendanceRecordId: rec.id, isManualResend: true } })) + 1;
  const job = await prisma.$transaction(async (tx) => {
    const r = await enqueueReceiptEmail(tx, {
      eventId: rec.eventId,
      recordId: rec.id,
      documentId: doc.id,
      recipient,
      eventName: rec.event.name,
      manual: { userId: actor.userId, n },
    });
    await audit(
      actor,
      { action: 'EMAIL_RESEND_REQUESTED', entityType: 'attendance_record', entityId: rec.id, eventId: rec.eventId, details: { key: r.key, recipient: maskEmail(recipient), changedRecipient: recipient !== rec.attendee.email } },
      tx,
    );
    return tx.emailJob.findUniqueOrThrow({ where: { idempotencyKey: r.key } });
  });
  await kickEmailQueue();
  return job;
}

/**
 * Webhooks de los proveedores (confirmación de entrega o rebote).
 * Solo con esta confirmación un correo pasa a "Entregado".
 */
export async function applyProviderEvent(messageId: string, kind: 'delivered' | 'bounced' | 'complained' | 'failed', raw: unknown) {
  const job = await prisma.emailJob.findFirst({ where: { providerMessageId: messageId } });
  if (!job) return { matched: false };
  const status = kind === 'delivered' ? 'DELIVERED' : 'REJECTED';
  await prisma.emailJob.update({
    where: { id: job.id },
    data: { status, deliveredAt: kind === 'delivered' ? new Date() : null, lastError: kind === 'delivered' ? null : `Proveedor reportó: ${kind}` },
  });
  await prisma.notificationLog.create({
    data: {
      emailJobId: job.id,
      channel: 'EMAIL',
      kind: 'WEBHOOK',
      recipientMasked: maskEmail(job.recipient),
      status,
      provider: job.provider,
      providerMessageId: messageId,
      details: raw as Prisma.InputJsonValue,
    },
  });
  await audit(systemActor, { action: `EMAIL_${status}`, entityType: 'email_job', entityId: job.id, eventId: job.eventId, details: { messageId } });
  return { matched: true, status };
}
