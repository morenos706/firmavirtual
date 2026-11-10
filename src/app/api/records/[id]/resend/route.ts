import { z } from 'zod';
import { api, actorFrom, json, parseJson, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { resendReceipt } from '@/server/email/queue';

const schema = z.object({ recipient: z.string().trim().email().max(200).optional().nullable() });
export const POST = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const { id } = await params;
  const { recipient } = await parseJson(req, schema);
  const job = await resendReceipt(id, { ...actorFrom(req, u), userId: u.id }, recipient);
  return json({ job: { id: job.id, status: job.status } }, 201);
});
