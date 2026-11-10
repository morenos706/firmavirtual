import { api, actorFrom, json, parseJson, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { userUpdateSchema } from '@/lib/validation';
import { updateUser } from '@/server/users';

export const PATCH = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const { id } = await params;
  const input = await parseJson(req, userUpdateSchema);
  const user = await updateUser(id, input, { ...actorFrom(req, u), userId: u.id });
  return json({ user: { id: user.id } });
});
