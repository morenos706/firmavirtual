import type { EventStatus, Prisma } from '@prisma/client';
import { api, actorFrom, json, parseJson } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { eventScope } from '@/lib/permissions';
import { eventInputSchema } from '@/lib/validation';
import { createEvent } from '@/server/events';

export const dynamic = 'force-dynamic';
const STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'FINALIZED', 'CANCELLED'];

export const GET = api(async (req) => {
  const u = await requireApiUser(req);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const q = sp.get('q')?.trim();
  const where: Prisma.EventWhereInput = {
    AND: [
      eventScope(u),
      status && STATUSES.includes(status) ? { status: status as EventStatus } : {},
      q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { topic: { contains: q, mode: 'insensitive' } }] } : {},
    ],
  };
  const events = await prisma.event.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      organizer: { select: { name: true } },
      _count: { select: { attendanceRecords: { where: { status: 'COMPLETED' } } } },
    },
  });
  return json({
    events: events.map((e) => ({
      id: e.id, code: e.code, name: e.name, topic: e.topic, date: e.date.toISOString().slice(0, 10), startTime: e.startTime, endTime: e.endTime,
      location: e.location, status: e.status, organizer: e.organizer.name, signed: e._count.attendanceRecords, closingStatus: e.closingStatus,
    })),
  });
});

export const POST = api(async (req) => {
  const u = await requireApiUser(req, ['ADMIN', 'ORGANIZER']);
  const input = await parseJson(req, eventInputSchema);
  const ev = await createEvent(u, input, actorFrom(req, u));
  return json({ event: { id: ev.id, code: ev.code } }, 201);
});
