import { api, actorFrom, fileResponse, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { getFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const { id } = await params;
  const sig = await prisma.signature.findUnique({ where: { attendanceRecordId: id }, include: { attendanceRecord: true } });
  if (!sig) throw Errors.notFound('Firma');
  await audit(actorFrom(req, u), { action: 'SIGNATURE_VIEWED', entityType: 'signature', entityId: sig.id, eventId: sig.attendanceRecord.eventId });
  return fileResponse(await getFile(sig.imagePath), `firma_${sig.attendanceRecord.evidenceCode}.png`, 'image/png', true);
});
