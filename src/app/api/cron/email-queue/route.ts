import crypto from 'node:crypto';
import { api, json } from '@/lib/http';
import { Errors } from '@/lib/errors';
import { processEmailQueue } from '@/server/email/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Procesa la cola de correos (reintentos programados). Pensado para Vercel Cron
 * (envía "Authorization: Bearer $CRON_SECRET") o cualquier programador externo.
 */
export const GET = api(async (req) => {
  const secret = process.env.CRON_SECRET || '';
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw Errors.unauthorized();
  const processed = await processEmailQueue({ maxBatches: 20 });
  return json({ processed, at: new Date().toISOString() });
}, { csrf: false });
