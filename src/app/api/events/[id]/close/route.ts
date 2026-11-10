import { api, actorFrom, json, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { closeEvent } from '@/server/closing';

export const maxDuration = 300;
export const POST = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN', 'ORGANIZER']);
  const { id } = await params;
  return json(await closeEvent(u, id, actorFrom(req, u)));
});
