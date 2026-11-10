import { api, actorFrom, json, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { Errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';
/** Expediente digital de evidencia de un registro (solo administrador). */
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const { id } = await params;
  const rec = await prisma.attendanceRecord.findUnique({
    where: { id },
    include: { signature: { omit: { imagePath: true } }, consents: true, otpVerifications: { omit: { codeHash: true, destinationHash: true } }, documents: true },
  });
  if (!rec) throw Errors.notFound('Registro');
  await audit(actorFrom(req, u), { action: 'EVIDENCE_VIEWED', entityType: 'attendance_record', entityId: id, eventId: rec.eventId });
  const { registrationTokenHash: _t, documentNumberHash: _d, ...safe } = rec;
  return json({ record: safe });
});
