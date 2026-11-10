import { api, fileResponse, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { actorFrom } from '@/lib/http';
import { loadEventFor } from '@/lib/permissions';
import { getFile } from '@/lib/storage';
import { buildSheet } from '@/server/documents/service';

export const dynamic = 'force-dynamic';
/** Planilla oficial: versión definitiva (si el evento está cerrado) o vista previa en vivo. */
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  const ev = await loadEventFor(u, id, 'view');
  const inline = req.nextUrl.searchParams.get('inline') === '1';
  const final = await prisma.document.findUnique({ where: { idempotencyKey: `SHEET:${id}` } });
  await audit(actorFrom(req, u), { action: 'SHEET_DOWNLOADED', entityType: 'event', entityId: id, eventId: id, details: { final: Boolean(final) } });
  if (final) return fileResponse(await getFile(final.storagePath), final.fileName, final.mimeType, inline);
  const { buffer } = await buildSheet(id, { draft: true, verificationCode: 'VISTA-PREVIA' });
  return fileResponse(buffer, `Planilla_VistaPrevia_${ev.code}.pdf`, 'application/pdf', inline);
});
