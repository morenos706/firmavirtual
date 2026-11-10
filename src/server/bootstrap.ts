import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { DEFAULT_DATA_TREATMENT, DEFAULT_SIGNATURE_AGREEMENT } from '@/lib/legal-defaults';
import { putFile, storageProblem } from '@/lib/storage';

/**
 * Datos base idempotentes (equivalente a la carga inicial): roles, configuración,
 * textos jurídicos v1.0 y logotipo institucional del Manual de Marca Prebel.
 */
export async function ensureBaseData() {
  await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN', label: 'Administrador', description: 'Acceso total' } });
  await prisma.role.upsert({ where: { name: 'ORGANIZER' }, update: {}, create: { name: 'ORGANIZER', label: 'Organizador', description: 'Gestiona sus propios eventos' } });
  const settings = await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, companyName: process.env.SEED_COMPANY_NAME || 'PREBEL S.A.' } });
  for (const [type, t] of [['SIGNATURE_AGREEMENT', DEFAULT_SIGNATURE_AGREEMENT], ['DATA_TREATMENT', DEFAULT_DATA_TREATMENT]] as const) {
    if (!(await prisma.legalText.findFirst({ where: { type } })))
      await prisma.legalText.create({ data: { type, version: t.version, title: t.title, content: t.content, sha256: sha256(t.content), active: true } });
  }
  if (!settings.logoPath && !storageProblem()) {
    try {
      const logo = await fs.readFile(path.join(process.cwd(), 'assets', 'brand', 'prebel-logo-azul.png'));
      await putFile('branding/prebel-logo-azul.png', logo);
      await prisma.appSettings.update({ where: { id: 1 }, data: { logoPath: 'branding/prebel-logo-azul.png', logoMime: 'image/png' } });
    } catch (e) {
      console.error('[bootstrap] no fue posible cargar el logo', e);
    }
  }
}

export async function needsSetup() {
  try {
    return (await prisma.user.count({ where: { role: { name: 'ADMIN' } } })) === 0;
  } catch {
    return true;
  }
}
