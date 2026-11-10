import { api, clientIp, enforceRateLimit, json } from '@/lib/http';
import { resendOtp } from '@/server/registration';

export const POST = api(async (req) => {
  enforceRateLimit(req, 'reg-resend', 10, 10 * 60_000);
  return json(await resendOtp(req.headers.get('x-registration-token'), { ip: clientIp(req), userAgent: req.headers.get('user-agent') }));
});
