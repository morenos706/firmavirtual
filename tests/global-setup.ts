import { execSync } from 'node:child_process';
import fs from 'node:fs';

/** Aplica las migraciones a la base de datos de PRUEBAS (no destructivo). Cada prueba limpia sus tablas. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://firmaqr:firmaqr@localhost:5432/firmaqr_test?schema=public';
  if (!/_test(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL debe apuntar a una base de datos de pruebas (*_test)');
  try {
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  } catch (e) {
    const err = e as { stderr?: Buffer };
    throw new Error(`No fue posible migrar la base de pruebas: ${err.stderr?.toString().slice(0, 500)}`);
  }
  fs.rmSync('./storage-test', { recursive: true, force: true });
}
