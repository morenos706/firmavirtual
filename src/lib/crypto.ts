import crypto from 'node:crypto';
import { env } from './env';

/** SHA-256 hexadecimal. Se usa para integridad documental (NO es una firma digital certificada). */
export function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** HMAC-SHA256 con pimienta del servidor: índice ciego para búsquedas sin exponer el dato. */
export function blindIndex(value: string): string {
  return crypto.createHmac('sha256', env.hashPepper).update(value).digest('hex');
}

export function hmac(secret: string, value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

/** Cifrado autenticado AES-256-GCM. Formato: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', env.encryptionKey, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(payload: string): string {
  const [v, ivB, tagB, ctB] = payload.split('.');
  if (v !== 'v1' || !ivB || !tagB || ctB === undefined) throw new Error('Formato de cifrado inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', env.encryptionKey, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I

export function randomCode(groups = 3, size = 4, prefix = 'FQR'): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let s = '';
    for (let i = 0; i < size; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    parts.push(s);
  }
  return [prefix, ...parts].join('-');
}

export function randomOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** JSON canónico (claves ordenadas) para calcular huellas reproducibles. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}
