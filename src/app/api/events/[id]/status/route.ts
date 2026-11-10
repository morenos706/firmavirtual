import { z } from 'zod';
import { api, actorFrom, json, parseJson, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { changeEventStatus } from '@/server/events';

const schema = z.object({ status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'CANCELLED']), reason: z.string().max(1000).optional() });

export const POST = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN', 'ORGANIZER']);
  const { id } = await params;
  const { status, reason } = await parseJson(req, schema);
  const ev = await changeEventStatus(u, id, status, actorFrom(req, u), reason);
  return json({ status: ev.status });
});
