/**
 * Compilación en Vercel: migraciones (si hay base de datos configurada) + next build.
 * - DIRECT_URL faltante → usa DATABASE_URL.
 * - Sin DATABASE_URL → omite migraciones con advertencia (la app fallará en ejecución hasta configurarla).
 */
import { execSync } from 'node:child_process';

const run = (cmd, env = process.env) => execSync(cmd, { stdio: 'inherit', env });
const env = { ...process.env };
const missing = ['DATABASE_URL', 'DIRECT_URL', 'APP_URL', 'APP_ENCRYPTION_KEY', 'HASH_PEPPER', 'OTP_SECRET', 'STORAGE_DRIVER'].filter((k) => !env[k]);
if (missing.length) {
  console.warn(`\n⚠️  FirmaQR: variables NO disponibles en este entorno de Vercel (${env.VERCEL_ENV ?? 'desconocido'}): ${missing.join(', ')}`);
  console.warn('   Agréguelas en Settings → Environment Variables marcando Production y Preview, y vuelva a desplegar.\n');
}
if (!env.DIRECT_URL && env.DATABASE_URL) env.DIRECT_URL = env.DATABASE_URL;
run('npx prisma generate', { ...env, DIRECT_URL: env.DIRECT_URL || 'postgresql://placeholder/placeholder' });
if (env.DATABASE_URL) run('npx prisma migrate deploy', env);
else console.warn('⚠️  Sin DATABASE_URL: se omiten las migraciones.');
run('npx next build', env);
