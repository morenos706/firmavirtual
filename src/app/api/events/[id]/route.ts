import { z } from 'zod';
import { api, actorFrom, json, parseJson, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { can, loadEventFor } from '@/lib/permissions';
import { eventInputSchema } from '@/lib/validation';
import { registrationUrl, updateEvent } from '@/server/events';

export const dynamic = 'force-dynamic';

export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  await loadEventFor(u, id, 'view');
  const ev = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: { fields: { orderBy: { order: 'asc' } }, qr: true, organizer: { select: { id: true, name: true } }, closedBy: { select: { name: true } } },
  });
  const counts = await prisma.attendanceRecord.groupBy({ by: ['status'], where: { eventId: id }, _count: true });
  const docs = await prisma.document.findMany({ where: { eventId: id, type: { not: 'RECEIPT' } }, orderBy: { createdAt: 'asc' } });
  return json({
    event: {
      ...ev,
      date: ev.date.toISOString().slice(0, 10),
      durationHours: ev.durationHours.toNumber(),
      qr: ev.qr && { active: ev.qr.active, scans: ev.qr.scans, url: registrationUrl(env.appUrl, ev.qr.token), rotatedAt: ev.qr.rotatedAt },
    },
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    documents: docs.map((d) => ({ id: d.id, type: d.type, fileName: d.fileName, sha256: d.sha256, verificationCode: d.verificationCode, createdAt: d.createdAt })),
    permissions: { manage: can.manageEvent(u, ev), admin: u.role === 'ADMIN' },
  });
});

const updateSchema = z.object({ data: eventInputSchema, justification: z.string().max(1000).optional().nullable() });

export const PUT = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN', 'ORGANIZER']);
  const { id } = await params;
  const body = await parseJson(req, updateSchema);
  const ev = await updateEvent(u, id, body.data, actorFrom(req, u), body.justification);
  return json({ event: { id: ev.id } });
});
