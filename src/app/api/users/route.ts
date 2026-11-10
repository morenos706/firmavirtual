import { api, actorFrom, json, parseJson } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { userCreateSchema } from '@/lib/validation';
import { createUser, listUsers } from '@/server/users';

export const dynamic = 'force-dynamic';
export const GET = api(async (req) => {
  const u = await requireApiUser(req);
  const users = await listUsers();
  // Los organizadores solo necesitan la lista para mostrar nombres; los datos completos son del administrador.
  if (u.role !== 'ADMIN') return json({ users: users.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name })) });
  return json({ users });
});
export const POST = api(async (req) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const input = await parseJson(req, userCreateSchema);
  const user = await createUser(input, actorFrom(req, u));
  return json({ user: { id: user.id, email: user.email } }, 201);
});
