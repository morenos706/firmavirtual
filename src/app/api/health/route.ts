import { prisma } from '@/lib/db';
import { json } from '@/lib/http';
import { storageDriverName, storageProblem } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico de despliegue. No revela valores de secretos: solo indica qué falta.
 * Abra /api/health en el navegador después de desplegar.
 */
export async function GET() {
  const problems: string[] = [];
  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.length > 0);
  if (!has('DATABASE_URL')) problems.push('Falta DATABASE_URL (cadena de conexión de PostgreSQL).');
  if (!has('DIRECT_URL')) problems.push('Falta DIRECT_URL (conexión directa para migraciones; si no usa pooler, igual a DATABASE_URL).');
  if (!has('APP_ENCRYPTION_KEY')) problems.push('Falta APP_ENCRYPTION_KEY (openssl rand -base64 32).');
  else if (Buffer.from(process.env.APP_ENCRYPTION_KEY!, 'base64').length !== 32) problems.push('APP_ENCRYPTION_KEY no tiene 32 bytes en base64 (genere con: openssl rand -base64 32).');
  if (!has('HASH_PEPPER')) problems.push('Falta HASH_PEPPER (openssl rand -hex 32).');
  if (!has('OTP_SECRET')) problems.push('Falta OTP_SECRET (openssl rand -hex 32).');
  if (!has('APP_URL')) problems.push('Falta APP_URL (p. ej. https://firmavirtual.vercel.app).');
  const sp = storageProblem();
  if (sp) problems.push(sp);
  if (!has('EMAIL_PROVIDER') || process.env.EMAIL_PROVIDER === 'file') problems.push('EMAIL_PROVIDER no configurado para envío real (use resend, sendgrid o smtp).');

  let db = 'ok';
  let admins: number | null = null;
  if (has('DATABASE_URL')) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      try {
        admins = await prisma.user.count({ where: { role: { name: 'ADMIN' }, active: true } });
        if (admins === 0) problems.push('No hay administradores: abra /instalar para crear el primer administrador.');
      } catch {
        db = 'sin tablas';
        problems.push('La base de datos no tiene las tablas: ejecute las migraciones (npx prisma migrate deploy).');
      }
    } catch (e) {
      db = 'inaccesible';
      problems.push(`No se pudo conectar a la base de datos: ${(e as Error).message.split('\n').filter(Boolean).pop()?.slice(0, 200)}`);
    }
  } else db = 'sin configurar';

  const blocking = problems.filter((p) => !p.startsWith('EMAIL_PROVIDER'));
  return json(
    { status: blocking.length ? 'error' : 'ok', db, storage: storageDriverName(), admins, problems, vercel: Boolean(process.env.VERCEL), time: new Date().toISOString() },
    blocking.length ? 503 : 200,
  );
}
