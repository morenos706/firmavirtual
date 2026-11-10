import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { SESSION_COOKIE, destroySession } from '@/lib/auth';

export const POST = api(async (req) => {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', expires: new Date(0) });
  return res;
});
