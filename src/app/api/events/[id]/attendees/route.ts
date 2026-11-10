import { api, json, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { loadEventFor } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  await loadEventFor(u, id, 'view');
  const recs = await prisma.attendanceRecord.findMany({
    where: { eventId: id },
    include: { attendee: true, signature: { select: { id: true, capturedAt: true, pointerType: true } } },
    orderBy: [{ sequence: { sort: 'asc', nulls: 'last' } }, { completedAt: 'asc' }, { startedAt: 'asc' }],
  });
  return json({
    attendees: recs.map((r) => ({
      id: r.id,
      sequence: r.sequence,
      status: r.status,
      evidenceCode: r.evidenceCode,
      documentNumber: decrypt(r.attendee.documentNumberEnc),
      fullName: r.attendee.fullName,
      company: r.attendee.company,
      management: r.attendee.management,
      area: r.attendee.area,
      email: r.attendee.email,
      authMethod: r.authMethod,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      hasSignature: Boolean(r.signature),
      evidenceHash: r.evidenceHash,
    })),
    canViewSignatures: u.role === 'ADMIN',
  });
});
