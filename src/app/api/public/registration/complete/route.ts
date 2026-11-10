import { z } from 'zod';
import { api, clientIp, enforceRateLimit, json, parseJson } from '@/lib/http';
import { completeRegistration } from '@/server/registration';

const schema = z.object({
  imageDataUrl: z.string().max(2_100_000),
  strokeCount: z.number().int().min(0).max(10_000),
  pointCount: z.number().int().min(0).max(1_000_000),
  drawDurationMs: z.number().int().min(0).max(3_600_000).optional().nullable(),
  pointerType: z.string().max(20).optional().nullable(),
  device: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional().nullable(),
});
export const POST = api(async (req) => {
  enforceRateLimit(req, 'reg-complete', 20, 10 * 60_000);
  const body = await parseJson(req, schema);
  return json(await completeRegistration(req.headers.get('x-registration-token'), body, { ip: clientIp(req), userAgent: req.headers.get('user-agent') }));
});
