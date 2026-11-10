import JSZip from 'jszip';
import { api, actorFrom, fileResponse, json, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { loadEventFor } from '@/lib/permissions';
import { getFile } from '@/lib/storage';
import { kickEmailQueue } from '@/server/email/queue';

export const dynamic = 'force-dynamic';
/** Panel COMPROBANTES ENVIADOS (?download=zip descarga todos — solo administrador). */
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  const ev = await loadEventFor(u, id, 'view');
  if (req.nextUrl.searchParams.get('download') === 'zip') {
    if (u.role !== 'ADMIN') throw Errors.forbidden('Solo el administrador puede descargar los comprobantes.');
    const docs = await prisma.document.findMany({ where: { eventId: id, type: 'RECEIPT' } });
    if (!docs.length) throw Errors.notFound('Comprobantes');
    const zip = new JSZip();
    for (const d of docs) zip.file(d.fileName, await getFile(d.storagePath));
    zip.file('HUELLAS_SHA256.txt', docs.map((d) => `${d.sha256}  ${d.fileName}`).join('\n') + '\n');
    await audit(actorFrom(req, u), { action: 'RECEIPTS_DOWNLOADED', entityType: 'event', entityId: id, eventId: id, details: { count: docs.length } });
    return fileResponse(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), `Comprobantes_${ev.code}.zip`, 'application/zip');
  }
  // Procesamiento oportunista de la cola mientras alguien consulta el panel (útil en serverless).
  await kickEmailQueue();
  const recs = await prisma.attendanceRecord.findMany({
    where: { eventId: id, status: 'COMPLETED' },
    include: {
      attendee: { select: { fullName: true, email: true } },
      documents: { where: { type: 'RECEIPT' }, select: { id: true, fileName: true, sha256: true, createdAt: true } },
      emailJobs: { orderBy: { createdAt: 'desc' }, include: { notifications: { orderBy: { createdAt: 'asc' } } } },
    },
    orderBy: [{ sequence: { sort: 'asc', nulls: 'last' } }, { completedAt: 'asc' }],
  });
  return json({
    canResend: u.role === 'ADMIN',
    canDownload: u.role === 'ADMIN',
    items: recs.map((r) => {
      const job = r.emailJobs[0];
      return {
        recordId: r.id,
        sequence: r.sequence,
        evidenceCode: r.evidenceCode,
        participant: r.attendee.fullName,
        email: job?.recipient ?? r.attendee.email,
        signedAt: r.completedAt,
        document: r.documents[0] ?? null,
        emailStatus: job?.status ?? null,
        sentAt: job?.sentAt ?? null,
        deliveredAt: job?.deliveredAt ?? null,
        attempts: r.emailJobs.reduce((a, j) => a + j.attempts, 0),
        error: job?.lastError ?? null,
        history: r.emailJobs.flatMap((j) => j.notifications.map((n) => ({ at: n.createdAt, status: n.status, error: n.error, manual: j.isManualResend }))),
      };
    }),
  });
});
