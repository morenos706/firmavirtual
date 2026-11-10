import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { getFile } from '@/lib/storage';
import { closeEvent } from '@/server/closing';
import { applyProviderEvent, processEmailQueue, resendReceipt } from '@/server/email/queue';
import { mockOutbox } from '@/server/email/providers';
import { startRegistration } from '@/server/registration';
import { activeEvent, actorOf, makeUser, meta, registerParticipant, resetDb } from './helpers';

async function setupClosedEvent(n: number, emails?: (i: number) => string) {
  const org = await makeUser('ORGANIZER');
  const { event, token } = await activeEvent(org);
  for (let i = 1; i <= n; i++) await registerParticipant(token, i, emails ? { email: emails(i) } : {});
  return { org, event, token };
}

describe('Cierre del evento, comprobantes y cola de correos', () => {
  beforeEach(resetDb);

  it('cierra el evento: bloquea registros, genera planilla, comprobantes y encola correos solo a firmantes', async () => {
    const { org, event, token } = await setupClosedEvent(3);
    // Un participante que no completó su firma
    await startRegistration(token, { documentNumber: '9999999', fullName: 'Sin Firma', email: 'nofirma@x.co', company: 'a', management: 'b', area: 'c' }, meta);
    const otpMails = mockOutbox.sent.length;

    const res = await closeEvent(org, event.id, actorOf(org));
    expect(res.report.signed).toBe(3);
    expect(res.report.valid).toBe(3);
    expect(res.report.registered).toBe(4);
    expect(res.report.incompleteRegistrations).toBe(1);
    expect(res.report.receipts).toBe(3);
    expect(res.report.sheets).toBe(1);
    expect(res.report.emailsQueued).toBe(3);
    expect(res.report.emailsPending).toBe(3);

    const ev = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, include: { qr: true } });
    expect(ev.status).toBe('FINALIZED');
    expect(ev.closingStatus).toBe('COMPLETED');
    expect(ev.qr?.active).toBe(false);

    const recs = await prisma.attendanceRecord.findMany({ where: { eventId: event.id, status: 'COMPLETED' }, orderBy: { sequence: 'asc' } });
    expect(recs.map((r) => r.sequence)).toEqual([1, 2, 3]);

    const docs = await prisma.document.findMany({ where: { eventId: event.id } });
    expect(docs.filter((d) => d.type === 'RECEIPT')).toHaveLength(3);
    expect(docs.map((d) => d.type).sort()).toEqual(['ATTENDANCE_SHEET', 'ATTENDANCE_XLSX', 'CLOSING_REPORT_PDF', 'CLOSING_REPORT_XLSX', 'RECEIPT', 'RECEIPT', 'RECEIPT']);
    for (const d of docs) expect(sha256(await getFile(d.storagePath))).toBe(d.sha256);

    // Envío (cola): no se envía a quien no firmó
    expect(await processEmailQueue()).toBe(3);
    const sent = mockOutbox.sent.slice(otpMails);
    expect(sent).toHaveLength(3);
    expect(sent.map((m) => m.to)).not.toContain('nofirma@x.co');
    const m = sent[0];
    expect(m.subject).toBe(`Comprobante de asistencia - ${event.name}`);
    expect(m.text).toContain('Estimado(a) ');
    expect(m.text).toContain('Adjuntamos su comprobante electrónico de asistencia generado mediante la plataforma FirmaQR.');
    expect(m.text).toContain('Sistema FirmaQR');
    expect(m.attachments?.[0].filename).toMatch(/^Comprobante_FQR-.*\.pdf$/);
    // Cada participante recibe exclusivamente su propio comprobante
    for (const msg of sent) {
      const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { emailNormalized: msg.to } });
      const doc = await prisma.document.findFirstOrThrow({ where: { attendanceRecordId: rec.id, type: 'RECEIPT' } });
      expect(sha256(msg.attachments![0].content)).toBe(doc.sha256);
    }
    const jobs = await prisma.emailJob.findMany({ where: { eventId: event.id } });
    expect(jobs.every((j) => j.status === 'SENT_TO_PROVIDER' && j.attempts === 1 && j.providerMessageId)).toBe(true);
  });

  it('es idempotente: cerrar dos veces no duplica documentos ni correos', async () => {
    const { org, event } = await setupClosedEvent(2);
    await closeEvent(org, event.id, actorOf(org));
    await processEmailQueue();
    const before = { docs: await prisma.document.count(), jobs: await prisma.emailJob.count(), sent: mockOutbox.sent.length };
    const again = await closeEvent(org, event.id, actorOf(org));
    expect(again.alreadyClosed).toBe(true);
    // Reanudación forzada del pipeline (p. ej. tras un fallo) tampoco duplica
    await prisma.event.update({ where: { id: event.id }, data: { closingStatus: 'FAILED' } });
    await closeEvent(org, event.id, actorOf(org));
    await processEmailQueue();
    expect(await prisma.document.count()).toBe(before.docs);
    expect(await prisma.emailJob.count()).toBe(before.jobs);
    expect(mockOutbox.sent.length).toBe(before.sent);
  });

  it('correo inválido → Rechazado sin reintentos; error transitorio → Reintentando y luego enviado; permanente → Rechazado; agota intentos → Fallido', async () => {
    const { org, event } = await setupClosedEvent(4);
    // Simula un correo inválido almacenado (p. ej. migrado de otro sistema)
    await closeEvent(org, event.id, actorOf(org));
    const jobs = await prisma.emailJob.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'asc' } });
    await prisma.emailJob.update({ where: { id: jobs[0].id }, data: { recipient: 'correo-invalido@' } });

    mockOutbox.failNext.push({ permanent: false, message: 'Proveedor HTTP 503' }); // job 2 transitorio
    mockOutbox.failNext.push({ permanent: true, message: 'Proveedor HTTP 422: buzón inexistente' }); // job 3 permanente
    await processEmailQueue();
    const after = await prisma.emailJob.findMany({ where: { eventId: event.id } });
    const byId = Object.fromEntries(after.map((j) => [j.id, j]));
    expect(byId[jobs[0].id].status).toBe('REJECTED');
    expect(byId[jobs[0].id].lastError).toContain('inválida');
    const others = after.filter((j) => j.id !== jobs[0].id);
    const retrying = others.find((j) => j.status === 'RETRYING')!;
    expect(retrying.lastError).toContain('503');
    expect(retrying.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(others.find((j) => j.status === 'REJECTED')!.lastError).toContain('422');
    expect(others.filter((j) => j.status === 'SENT_TO_PROVIDER')).toHaveLength(1);

    // Reintento automático cuando vence la espera
    await prisma.emailJob.update({ where: { id: retrying.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await processEmailQueue();
    const retried = await prisma.emailJob.findUniqueOrThrow({ where: { id: retrying.id } });
    expect(retried.status).toBe('SENT_TO_PROVIDER');
    expect(retried.attempts).toBe(2);

    // Agotar intentos → FALLIDO
    const { event: ev2, org: org2 } = await setupClosedEvent(1, () => 'unico@x.co');
    await closeEvent(org2, ev2.id, actorOf(org2));
    const job = await prisma.emailJob.findFirstOrThrow({ where: { eventId: ev2.id } });
    for (let i = 0; i < 5; i++) {
      mockOutbox.failNext.push({ permanent: false, message: 'timeout' });
      await prisma.emailJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await processEmailQueue();
    }
    const failed = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.attempts).toBe(5);
    expect(await prisma.notificationLog.count({ where: { emailJobId: job.id } })).toBe(5);
  });

  it('reenvío manual (administrador) con historial, y confirmación de entrega por webhook', async () => {
    const admin = await makeUser('ADMIN');
    const { org, event } = await setupClosedEvent(1);
    await closeEvent(org, event.id, actorOf(org));
    await processEmailQueue();
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { eventId: event.id, status: 'COMPLETED' } });
    const job = await resendReceipt(rec.id, { ...actorOf(admin), userId: admin.id });
    expect(job.isManualResend).toBe(true);
    await expect(resendReceipt(rec.id, { ...actorOf(admin), userId: admin.id })).rejects.toThrow(/en cola/);
    await processEmailQueue();
    const all = await prisma.emailJob.findMany({ where: { attendanceRecordId: rec.id } });
    expect(all).toHaveLength(2);
    expect(all.every((j) => j.status === 'SENT_TO_PROVIDER')).toBe(true);

    const r = await applyProviderEvent(all[0].providerMessageId!, 'delivered', { type: 'email.delivered' });
    expect(r.status).toBe('DELIVERED');
    const delivered = await prisma.emailJob.findUniqueOrThrow({ where: { id: all[0].id } });
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.deliveredAt).toBeTruthy();
  });

  it('el reenvío no aplica a quien no firmó; las evidencias firmadas no se pueden alterar', async () => {
    const admin = await makeUser('ADMIN');
    const { org, event, token } = await setupClosedEvent(1);
    const pending = await prisma.attendanceRecord.count();
    expect(pending).toBe(1);
    await closeEvent(org, event.id, actorOf(org));
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { eventId: event.id } });
    await expect(prisma.attendanceRecord.update({ where: { id: rec.id }, data: { evidenceHash: 'x' } })).rejects.toThrow(/FIRMAQR_IMMUTABLE/);
    await expect(prisma.signature.deleteMany({})).rejects.toThrow(/FIRMAQR_IMMUTABLE/);
    await expect(prisma.document.updateMany({ data: { sha256: 'x' } })).rejects.toThrow(/FIRMAQR_IMMUTABLE/);
    await expect(prisma.event.update({ where: { id: event.id }, data: { trainer: 'Otro' } })).rejects.toThrow(/FIRMAQR_IMMUTABLE/);
    await expect(prisma.attendee.updateMany({ data: { fullName: 'Otro' } })).rejects.toThrow(/FIRMAQR_IMMUTABLE/);
    void token;
    void admin;
  });
});
