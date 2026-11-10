import type { RoleName } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit, type AuditActor } from '@/lib/audit';
import { hashPassword, validatePasswordStrength } from '@/lib/auth';
import { Errors } from '@/lib/errors';

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, active: true, lastLoginAt: true, createdAt: true, role: { select: { name: true, label: true } } },
  });
}

export async function createUser(input: { email: string; name: string; role: RoleName; password: string }, actor: AuditActor) {
  const pwErr = validatePasswordStrength(input.password);
  if (pwErr) throw Errors.badRequest(pwErr);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw Errors.conflict('EMAIL_TAKEN', 'Ya existe un usuario con ese correo.');
  const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role } });
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, roleId: role.id, passwordHash: await hashPassword(input.password) },
  });
  await audit(actor, { action: 'USER_CREATED', entityType: 'user', entityId: user.id, details: { email: user.email, role: input.role } });
  return user;
}

export async function updateUser(
  id: string,
  input: { name?: string; role?: RoleName; active?: boolean; password?: string },
  actor: AuditActor & { userId: string },
) {
  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) throw Errors.notFound('Usuario');
  if (id === actor.userId && (input.active === false || (input.role && input.role !== 'ADMIN')))
    throw Errors.badRequest('No puede desactivarse ni quitarse el rol de administrador a sí mismo.');
  if (user.role.name === 'ADMIN' && (input.role === 'ORGANIZER' || input.active === false)) {
    const admins = await prisma.user.count({ where: { role: { name: 'ADMIN' }, active: true } });
    if (admins <= 1) throw Errors.conflict('LAST_ADMIN', 'Debe existir al menos un administrador activo.');
  }
  const data: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  if (input.name && input.name !== user.name) (data.name = input.name), (changes.name = { from: user.name, to: input.name });
  if (typeof input.active === 'boolean' && input.active !== user.active) (data.active = input.active), (changes.active = input.active);
  if (input.role && input.role !== user.role.name) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role } });
    data.roleId = role.id;
    changes.role = { from: user.role.name, to: input.role };
  }
  if (input.password) {
    const pwErr = validatePasswordStrength(input.password);
    if (pwErr) throw Errors.badRequest(pwErr);
    data.passwordHash = await hashPassword(input.password);
    data.failedLogins = 0;
    data.lockedUntil = null;
    changes.password = 'restablecida';
  }
  const updated = await prisma.user.update({ where: { id }, data });
  if (input.active === false || input.password || input.role) await prisma.session.deleteMany({ where: { userId: id } });
  await audit(actor, { action: 'USER_UPDATED', entityType: 'user', entityId: id, details: changes });
  return updated;
}
