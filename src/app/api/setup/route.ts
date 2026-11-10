import crypto from 'node:crypto';
import { z } from 'zod';
import { api, actorFrom, enforceRateLimit, json, parseJson } from '@/lib/http';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { hashPassword, validatePasswordStrength } from '@/lib/auth';
import { Errors } from '@/lib/errors';
import { ensureBaseData, needsSetup } from '@/server/bootstrap';

export const dynamic = 'force-dynamic';

/** ¿La instalación está pendiente? (no existe ningún administrador) */
export const GET = api(async () => json({ needsSetup: await needsSetup(), tokenRequired: Boolean(process.env.SETUP_TOKEN) }), { csrf: false });

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
  companyName: z.string().trim().min(2).max(150),
  setupToken: z.string().max(200).optional(),
});

/**
 * Instalación inicial desde el navegador: crea datos base y el PRIMER administrador.
 * Solo funciona mientras no exista ningún administrador. Si SETUP_TOKEN está definido, es obligatorio.
 */
export const POST = api(async (req) => {
  enforceRateLimit(req, 'setup', 10, 15 * 60_000);
  const input = await parseJson(req, schema);
  const expected = process.env.SETUP_TOKEN || '';
  if (expected) {
    const given = input.setupToken || '';
    if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected)))
      throw Errors.forbidden('Código de instalación incorrecto (variable SETUP_TOKEN en Vercel).');
  }
  const pwErr = validatePasswordStrength(input.password);
  if (pwErr) throw Errors.badRequest(pwErr);
  await ensureBaseData();
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(727212)`;
    if ((await tx.user.count({ where: { roleId: role.id } })) > 0) throw Errors.conflict('ALREADY_INSTALLED', 'La plataforma ya fue instalada. Inicie sesión.');
    await tx.appSettings.update({ where: { id: 1 }, data: { companyName: input.companyName } });
    return tx.user.create({ data: { email: input.email, name: input.name, roleId: role.id, passwordHash } });
  });
  await audit({ ...actorFrom(req), type: 'SYSTEM', label: 'Instalación inicial' }, { action: 'PLATFORM_INSTALLED', entityType: 'user', entityId: user.id, details: { email: user.email } });
  return json({ ok: true }, 201);
});
