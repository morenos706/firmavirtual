import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit, systemActor, type AuditActor } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import { canonicalJson, sha256 } from '@/lib/crypto';
import { Errors } from '@/lib/errors';
import { loadEventFor } from '@/lib/permissions';
import { getFile } from '@/lib/storage';
import {
  MIME,
  buildAttendanceXlsx,
  buildClosingReport,
  buildReceipt,
  buildSheet,
  completedRecords,
  computeClosingMetrics,
  ensureFinalDocument,
} from './documents/service';
import { enqueueReceiptEmail, kickEmailQueue } from './email/queue';

export type ClosingReport = Awaited<ReturnType<typeof computeClosingMetrics>> & {
  closedAt: string;
  inconsistencies: { evidenceCode: string; problem: string }[];
  incompleteRegistrations: number;
  emailsQueued: number;
};

/**
 * CERRAR EVENTO. Proceso idempotente:
 *  - la transición a FINALIZADO se hace una sola vez (actualización condicionada);
 *  - cada documento usa una clave de idempotencia (no se regenera ni duplica);
 *  - cada correo usa una clave única por registro (no se envía dos veces).
 * Si el proceso se interrumpe, puede reanudarse llamando de nuevo a esta función.
 */
export async function closeEvent(user: SessionUser, eventId: string, actor: AuditActor) {
  const ev = await loadEventFor(user, eventId, 'manage');
  if (ev.status === 'CANCELLED') throw Errors.conflict('EVENT_CANCELLED', 'No se puede cerrar un evento cancelado.');
  if (ev.status === 'DRAFT') throw Errors.conflict('EVENT_DRAFT', 'El evento está en borrador; prográmelo o actívelo antes de cerrarlo.');
  if (ev.status === 'FINALIZED' && ev.closingStatus === 'COMPLETED') {
    return { alreadyClosed: true, report: ev.closingReport as unknown as ClosingReport };
  }

  if (ev.status !== 'FINALIZED') {
    await prisma.$transaction(async (tx) => {
      const res = await tx.event.updateMany({
        where: { id: eventId, status: { in: ['ACTIVE', 'SCHEDULED'] } },
        data: { status: 'FINALIZED', closedAt: new Date(), closedById: user.id, closingStatus: 'IN_PROGRESS', closingError: null },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'El evento ya está siendo cerrado.');
      await tx.eventQr.updateMany({ where: { eventId }, data: { active: false, deactivatedAt: new Date() } });
      await audit(actor, { action: 'EVENT_CLOSED', entityType: 'event', entityId: eventId, eventId, details: { from: ev.status } }, tx);
    });
  } else {
    await prisma.event.update({ where: { id: eventId }, data: { closingStatus: 'IN_PROGRESS', closingError: null } });
    await audit(actor, { action: 'EVENT_CLOSING_RESUMED', entityType: 'event', entityId: eventId, eventId });
  }

  try {
    const report = await runClosingPipeline(eventId);
    return { alreadyClosed: false, report };
  } catch (e) {
    const message = (e as Error).message?.slice(0, 1000) ?? 'Error desconocido';
    await prisma.event.update({ where: { id: eventId }, data: { closingStatus: 'FAILED', closingError: message } });
    await audit(systemActor, { action: 'EVENT_CLOSING_FAILED', entityType: 'event', entityId: eventId, eventId, details: { message } });
    throw Errors.conflict('CLOSING_FAILED', `El cierre no terminó: ${message}. Puede reanudarlo; no se generarán duplicados.`);
  }
}

async function runClosingPipeline(eventId: string): Promise<ClosingReport> {
  const ev = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

  // 3. Consolidar participantes: asignar el consecutivo de la planilla (una sola vez).
  const recs = await completedRecords(eventId);
  let next = Math.max(0, ...recs.map((r) => r.sequence ?? 0)) + 1;
  for (const r of recs) {
    if (r.sequence == null) {
      await prisma.attendanceRecord.update({ where: { id: r.id }, data: { sequence: next } });
      r.sequence = next++;
    }
  }
  const incompleteRegistrations = await prisma.attendanceRecord.count({ where: { eventId, status: { in: ['STARTED', 'OTP_VERIFIED'] } } });

  // 4. Verificar firmas completadas (archivo presente, hash de imagen y hash del expediente).
  const inconsistencies: ClosingReport['inconsistencies'] = [];
  const validIds = new Set<string>();
  for (const r of recs) {
    if (!r.signature) {
      inconsistencies.push({ evidenceCode: r.evidenceCode, problem: 'Sin imagen de firma' });
      continue;
    }
    try {
      const img = await getFile(r.signature.imagePath);
      if (sha256(img) !== r.signature.imageSha256) {
        inconsistencies.push({ evidenceCode: r.evidenceCode, problem: 'La imagen de la firma no coincide con su huella' });
        continue;
      }
    } catch {
      inconsistencies.push({ evidenceCode: r.evidenceCode, problem: 'Archivo de firma no encontrado' });
      continue;
    }
    if (!r.evidenceJson || sha256(canonicalJson(r.evidenceJson)) !== r.evidenceHash) {
      inconsistencies.push({ evidenceCode: r.evidenceCode, problem: 'El expediente de evidencia no coincide con su huella' });
      continue;
    }
    validIds.add(r.id);
  }

  // 5-8. Planilla oficial definitiva (PDF + Excel) con su huella SHA-256.
  await ensureFinalDocument({
    idempotencyKey: `SHEET:${eventId}`,
    type: 'ATTENDANCE_SHEET',
    eventId,
    fileName: `Planilla_Asistencia_${ev.code}.pdf`,
    mimeType: MIME.pdf,
    verificationCode: undefined,
    generate: async (code) => (await buildSheet(eventId, { draft: false, verificationCode: code })).buffer,
  });
  await ensureFinalDocument({
    idempotencyKey: `ATT_XLSX:${eventId}`,
    type: 'ATTENDANCE_XLSX',
    eventId,
    fileName: `Asistencia_${ev.code}.xlsx`,
    mimeType: MIME.xlsx,
    generate: () => buildAttendanceXlsx(eventId),
  });

  // 6-7. Comprobante individual por participante con firma válida, y 9. encolar su correo.
  let emailsQueued = 0;
  for (const r of recs) {
    if (!validIds.has(r.id)) continue;
    const doc = await ensureFinalDocument({
      idempotencyKey: `RECEIPT:${r.id}`,
      type: 'RECEIPT',
      eventId,
      attendanceRecordId: r.id,
      fileName: `Comprobante_${r.evidenceCode}.pdf`,
      mimeType: MIME.pdf,
      verificationCode: r.evidenceCode,
      generate: () => buildReceipt(r.id),
    });
    const q = await prisma.$transaction((tx: Prisma.TransactionClient) =>
      enqueueReceiptEmail(tx, { eventId, recordId: r.id, documentId: doc.id, recipient: r.attendee.email, eventName: ev.name }),
    );
    if (q.created) emailsQueued++;
  }

  // 11. Informe general de cierre (instantánea al momento del cierre).
  const metrics = await computeClosingMetrics(eventId);
  const closedAt = (ev.closedAt ?? new Date()).toISOString();
  const report: ClosingReport = { ...metrics, closedAt, inconsistencies, incompleteRegistrations, emailsQueued };
  await ensureFinalDocument({
    idempotencyKey: `CLOSING_PDF:${eventId}`,
    type: 'CLOSING_REPORT_PDF',
    eventId,
    fileName: `Informe_Cierre_${ev.code}.pdf`,
    mimeType: MIME.pdf,
    generate: () => buildClosingReport(eventId, 'pdf'),
  });
  await ensureFinalDocument({
    idempotencyKey: `CLOSING_XLSX:${eventId}`,
    type: 'CLOSING_REPORT_XLSX',
    eventId,
    fileName: `Informe_Cierre_${ev.code}.xlsx`,
    mimeType: MIME.xlsx,
    generate: () => buildClosingReport(eventId, 'xlsx'),
  });

  await prisma.event.update({
    where: { id: eventId },
    data: { closingStatus: 'COMPLETED', closingReport: report as unknown as Prisma.InputJsonValue, closingError: null },
  });
  await audit(systemActor, { action: 'EVENT_CLOSING_COMPLETED', entityType: 'event', entityId: eventId, eventId, details: report as unknown as Record<string, unknown> });

  // 9-10. El envío ocurre en la cola (no bloquea el cierre); cada intento queda registrado.
  await kickEmailQueue();
  return report;
}
