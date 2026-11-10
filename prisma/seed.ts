import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DATA_TREATMENT, DEFAULT_SIGNATURE_AGREEMENT } from '../src/lib/legal-defaults';

const prisma = new PrismaClient();

async function main() {
  await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN', label: 'Administrador', description: 'Acceso total: usuarios, configuración, auditoría y todos los eventos' } });
  await prisma.role.upsert({ where: { name: 'ORGANIZER' }, update: {}, create: { name: 'ORGANIZER', label: 'Organizador', description: 'Crea y gestiona sus propios eventos' } });
  // Identidad institucional por defecto: Manual de Marca Prebel (logotipo Azul Prebel, versión preferente).
  const companyName = process.env.SEED_COMPANY_NAME || 'PREBEL S.A.';
  const settings = await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, companyName } });
  if (settings.companyName === 'Mi Empresa S.A.S.') await prisma.appSettings.update({ where: { id: 1 }, data: { companyName } });
  const brandLogo = path.join(process.cwd(), 'assets', 'brand', 'prebel-logo-azul.png');
  if (!settings.logoPath && process.env.SEED_SKIP_BRAND_LOGO !== 'true' && fs.existsSync(brandLogo)) {
    const storage = path.resolve(process.env.STORAGE_DIR || './storage');
    fs.mkdirSync(path.join(storage, 'branding'), { recursive: true });
    fs.copyFileSync(brandLogo, path.join(storage, 'branding', 'prebel-logo-azul.png'));
    await prisma.appSettings.update({ where: { id: 1 }, data: { logoPath: 'branding/prebel-logo-azul.png', logoMime: 'image/png' } });
    console.log('Logo institucional configurado (Manual de Marca Prebel).');
  }

  for (const [type, t] of [
    ['SIGNATURE_AGREEMENT', DEFAULT_SIGNATURE_AGREEMENT],
    ['DATA_TREATMENT', DEFAULT_DATA_TREATMENT],
  ] as const) {
    const exists = await prisma.legalText.findFirst({ where: { type } });
    if (!exists) {
      await prisma.legalText.create({
        data: { type, version: t.version, title: t.title, content: t.content, sha256: crypto.createHash('sha256').update(t.content).digest('hex'), active: true },
      });
    }
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@firmaqr.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'FirmaQR-Admin-2026';
  const admin = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  if (!(await prisma.user.findUnique({ where: { email: adminEmail } }))) {
    await prisma.user.create({ data: { email: adminEmail, name: 'Administrador FirmaQR', roleId: admin.id, passwordHash: await bcrypt.hash(adminPassword, 12) } });
    console.log(`Administrador creado: ${adminEmail}`);
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`Contraseña inicial (cámbiela de inmediato): ${adminPassword}`);
  }
  if (process.env.SEED_DEMO === 'true') {
    const org = await prisma.role.findUniqueOrThrow({ where: { name: 'ORGANIZER' } });
    if (!(await prisma.user.findUnique({ where: { email: 'organizador@firmaqr.local' } }))) {
      await prisma.user.create({
        data: { email: 'organizador@firmaqr.local', name: 'Organizador Demo', roleId: org.id, passwordHash: await bcrypt.hash('FirmaQR-Org-2026', 12) },
      });
      console.log('Organizador demo: organizador@firmaqr.local / FirmaQR-Org-2026');
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
