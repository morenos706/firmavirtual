import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import type { RoleName } from '@prisma/client';
import { prisma } from './db';
import { randomToken, sha256 } from './crypto';
import { env } from './env';
import { Errors } from './errors';

export const SESSION_COOKIE = 'fqr_session';
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type SessionUser = { id: string; email: string; name: string; role: RoleName };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw))
    return 'La contraseña debe incluir mayúsculas, minúsculas y números.';
  return null;
}

/** Verifica credenciales con bloqueo temporal tras intentos fallidos. */
export async function verifyCredentials(email: string, password: string): Promise<SessionUser | { error: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { role: true } });
  const generic = { error: 'Correo o contraseña incorrectos.' };
  if (!user) {
    await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuuJ6kXz1c2kq3yFj8Kc8n9o0p1q2r3s4t'); // tiempo constante
    return generic;
  }
  if (!user.active) return { error: 'El usuario está inactivo. Contacte al administrador.' };
  if (user.lockedUntil && user.lockedUntil > new Date())
    return { error: 'Usuario bloqueado temporalmente por intentos fallidos. Intente más tarde.' };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return generic;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role.name };
}

export async function createSession(userId: string, ip?: string | null, userAgent?: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.sessionHours * 3600_000);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, ip: ip ?? null, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  return { token, expiresAt };
}

export async function getSessionUserByToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  // Expiración deslizante (renueva si quedan menos de la mitad del tiempo)
  const half = (env.sessionHours * 3600_000) / 2;
  if (session.expiresAt.getTime() - Date.now() < half) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + env.sessionHours * 3600_000), lastSeenAt: new Date() },
    });
  }
  const u = session.user;
  return { id: u.id, email: u.email, name: u.name, role: u.role.name };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getSessionUserByToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser(roles?: RoleName[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthorized();
  if (roles && !roles.includes(user.role)) throw Errors.forbidden();
  return user;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

/** Autenticación para rutas API (lee la cookie de la petición). */
export async function requireApiUser(req: { cookies: { get(name: string): { value: string } | undefined } }, roles?: RoleName[]) {
  const user = await getSessionUserByToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw Errors.unauthorized();
  if (roles && !roles.includes(user.role)) throw Errors.forbidden();
  return user;
}
