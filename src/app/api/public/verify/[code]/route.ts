import { z } from 'zod';
import { api, enforceRateLimit, json, parseJson, type Ctx } from '@/lib/http';
import { compareDocumentHash, verifyCode } from '@/server/verification';

export const dynamic = 'force-dynamic';
export const GET = api<Ctx<'code'>>(async (req, { params }) => {
  enforceRateLimit(req, 'verify', 60, 60_000);
  const { code } = await params;
  return json(await verifyCode(decodeURIComponent(code)));
});
const schema = z.object({ sha256: z.string().regex(/^[a-fA-F0-9]{64}$/) });
export const POST = api<Ctx<'code'>>(async (req, { params }) => {
  enforceRateLimit(req, 'verify-compare', 30, 60_000);
  const { code } = await params;
  const { sha256 } = await parseJson(req, schema);
  return json(await compareDocumentHash(decodeURIComponent(code), sha256));
});
