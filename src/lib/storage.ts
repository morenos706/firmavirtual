import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { sha256 } from './crypto';

/**
 * Almacenamiento privado de archivos (firmas, PDF, Excel, logo).
 * Los archivos NUNCA se sirven desde /public: solo a través de rutas autenticadas.
 * Implementación local; la interfaz permite sustituirla por S3/Blob en producción.
 */
function root() {
  return path.resolve(env.storageDir);
}

export function resolveSafe(rel: string): string {
  const base = root();
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) throw new Error('Ruta de almacenamiento inválida');
  return full;
}

export async function putFile(rel: string, data: Buffer): Promise<{ path: string; sha256: string; size: number }> {
  const full = resolveSafe(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, { mode: 0o640 });
  await fs.rename(tmp, full);
  return { path: rel, sha256: sha256(data), size: data.length };
}

export async function getFile(rel: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(rel));
}

export async function fileExists(rel: string): Promise<boolean> {
  try {
    await fs.access(resolveSafe(rel));
    return true;
  } catch {
    return false;
  }
}
