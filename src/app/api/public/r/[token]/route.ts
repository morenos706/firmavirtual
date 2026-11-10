import { api, enforceRateLimit, json, type Ctx } from '@/lib/http';
import { getPublicEvent } from '@/server/registration';

export const dynamic = 'force-dynamic';
export const GET = api<Ctx<'token'>>(async (req, { params }) => {
  enforceRateLimit(req, 'public-event', 120, 60_000);
  const { token } = await params;
  return json(await getPublicEvent(token));
});
