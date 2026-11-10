import { api, clientIp, enforceRateLimit, json, type Ctx } from '@/lib/http';
import { startRegistration } from '@/server/registration';

export const POST = api<Ctx<'token'>>(async (req, { params }) => {
  enforceRateLimit(req, 'reg-start', 20, 10 * 60_000);
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const r = await startRegistration(token, body, { ip: clientIp(req), userAgent: req.headers.get('user-agent') });
  return json(r, 201);
});
