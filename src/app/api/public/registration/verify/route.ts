import { z } from 'zod';
import { api, clientIp, enforceRateLimit, json, parseJson } from '@/lib/http';
import { verifyRegistrationOtp } from '@/server/registration';

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'El código debe tener 6 dígitos') });
export const POST = api(async (req) => {
  enforceRateLimit(req, 'reg-verify', 30, 10 * 60_000);
  const { code } = await parseJson(req, schema);
  return json(await verifyRegistrationOtp(req.headers.get('x-registration-token'), code, { ip: clientIp(req), userAgent: req.headers.get('user-agent') }));
});
