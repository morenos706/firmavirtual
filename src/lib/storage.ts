import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { sha256 } from './crypto';

/**
 * Almacenamiento PRIVADO de archivos (firmas, PDF, Excel, logo).
 * Los archivos nunca se sirven directamente: solo a través de rutas autenticadas y auditadas.
 *
 * Controladores (STORAGE_DRIVER):
 *  - local: disco (STORAGE_DIR). Servidores propios / Docker.
 *  - s3:    bucket S3 compatible y privado (AWS S3, Cloudflare R2, Supabase Storage, MinIO…).
 *           Obligatorio en Vercel, cuyo disco es efímero.
 */
type Driver = {
  put(rel: string, data: Buffer, contentType?: string): Promise<void>;
  get(rel: string): Promise<Buffer>;
  exists(rel: string): Promise<boolean>;
};

export function storageDriverName(): 'local' | 's3' {
  return (process.env.STORAGE_DRIVER || 'local').toLowerCase() === 's3' ? 's3' : 'local';
}

/** Detecta configuraciones que perderían documentos (p. ej. disco local en Vercel). */
export function storageProblem(): string | null {
  if (storageDriverName() === 'local' && process.env.VERCEL)
    return 'En Vercel el disco es efímero: configure STORAGE_DRIVER=s3 y las variables S3_* (bucket privado).';
  if (storageDriverName() === 's3' && (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY))
    return 'Faltan variables S3_BUCKET, S3_ACCESS_KEY_ID o S3_SECRET_ACCESS_KEY.';
  return null;
}

function root() {
  return path.resolve(env.storageDir);
}

/** Ruta local segura (impide salir del directorio de almacenamiento). */
export function resolveSafe(rel: string): string {
  const base = root();
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) throw new Error('Ruta de almacenamiento inválida');
  return full;
}

function cleanKey(rel: string) {
  const k = path.posix.normalize(rel.replace(/\\/g, '/'));
  if (k.startsWith('..') || k.startsWith('/') || k.includes('/../')) throw new Error('Ruta de almacenamiento inválida');
  return k;
}

const localDriver: Driver = {
  async put(rel, data) {
    const full = resolveSafe(rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o640 });
    await fs.rename(tmp, full);
  },
  get: (rel) => fs.readFile(resolveSafe(rel)),
  async exists(rel) {
    try {
      await fs.access(resolveSafe(rel));
      return true;
    } catch {
      return false;
    }
  },
};

let s3Cache: Driver | null = null;
async function s3Driver(): Promise<Driver> {
  if (s3Cache) return s3Cache;
  const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
  });
  const Bucket = process.env.S3_BUCKET || '';
  const prefix = (process.env.S3_PREFIX || 'firmaqr/').replace(/^\/+/, '');
  const key = (rel: string) => prefix + cleanKey(rel);
  s3Cache = {
    async put(rel, data, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key(rel),
          Body: data,
          ContentType: contentType ?? 'application/octet-stream',
          ...(process.env.S3_SSE ? { ServerSideEncryption: process.env.S3_SSE as 'AES256' } : {}),
        }),
      );
    },
    async get(rel) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key(rel) }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    async exists(rel) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key(rel) }));
        return true;
      } catch {
        return false;
      }
    },
  };
  return s3Cache;
}

async function driver(): Promise<Driver> {
  const problem = storageProblem();
  if (problem) throw new Error(`Almacenamiento no configurado: ${problem}`);
  return storageDriverName() === 's3' ? s3Driver() : localDriver;
}

const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', json: 'application/json', html: 'text/html', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

export async function putFile(rel: string, data: Buffer): Promise<{ path: string; sha256: string; size: number }> {
  const ext = rel.split('.').pop()?.toLowerCase() ?? '';
  await (await driver()).put(rel, data, MIME[ext]);
  return { path: rel, sha256: sha256(data), size: data.length };
}

export async function getFile(rel: string): Promise<Buffer> {
  return (await driver()).get(rel);
}

export async function fileExists(rel: string): Promise<boolean> {
  return (await driver()).exists(rel);
}

