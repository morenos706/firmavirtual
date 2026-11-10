import { z } from 'zod';
import { api, clientIp, json, parseJson } from '@/lib/http';
import { acceptConsent } from '@/server/registration';

const schema = z.object({ type: z.enum(['SIGNATURE_AGREEMENT', 'DATA_TREATMENT']), legalTextId: z.string().min(1).max(50), accepted: z.literal(true) });
export const POST = api(async (req) => {
  const b = await parseJson(req, schema);
  const c = await acceptConsent(req.headers.get('x-registration-token'), b.type, b.legalTextId, b.accepted, { ip: clientIp(req), userAgent: req.headers.get('user-agent') });
  return json({ consent: { type: c.type, version: c.version, acceptedAt: c.acceptedAt } });
});
