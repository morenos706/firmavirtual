import { api, actorFrom, fileResponse, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { loadEventFor } from '@/lib/permissions';
import { getFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
/** Descarga controlada de documentos conservados. Los comprobantes individuales: solo administrador. */
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw Errors.notFound('Documento');
  await loadEventFor(u, doc.eventId, 'view');
  if (doc.type === 'RECEIPT' && u.role !== 'ADMIN') throw Errors.forbidden('Solo el administrador puede descargar comprobantes individuales.');
  await audit(actorFrom(req, u), { action: 'DOCUMENT_DOWNLOADED', entityType: 'document', entityId: id, eventId: doc.eventId, details: { type: doc.type } });
  return fileResponse(await getFile(doc.storagePath), doc.fileName, doc.mimeType, req.nextUrl.searchParams.get('inline') === '1');
});
