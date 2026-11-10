import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, clientIp, enforceRateLimit, parseJson } from '@/lib/http';
import { SESSION_COOKIE, createSession, sessionCookieOptions, verifyCredentials } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { AppError } from '@/lib/errors';

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

export const POST = api(async (req) => {
  enforceRateLimit(req, 'login', 10, 15 * 60_000);
  const { email, password } = await parseJson(req, schema);
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');
  const result = await verifyCredentials(email, password);
  if ('error' in result) {
    await audit({ type: 'SYSTEM', label: email, ip, userAgent: ua }, { action: 'LOGIN_FAILED', entityType: 'user', details: { email } });
    throw new AppError(401, 'INVALID_CREDENTIALS', result.error);
  }
  const { token, expiresAt } = await createSession(result.id, ip, ua);
  await audit({ type: 'USER', userId: result.id, label: result.email, ip, userAgent: ua }, { action: 'LOGIN_SUCCESS', entityType: 'user', entityId: result.id });
  const res = NextResponse.json({ user: result });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
});
