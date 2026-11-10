import crypto from 'node:crypto';
import { api, json } from '@/lib/http';
import { env } from '@/lib/env';
import { Errors } from '@/lib/errors';
import { applyProviderEvent } from '@/server/email/queue';

/**
 * Webhook de confirmación de entrega (Resend / SendGrid / genérico).
 * Autenticación: secreto compartido EMAIL_WEBHOOK_SECRET en el parámetro ?token= o la cabecera X-Webhook-Token.
 */
export const POST = api(async (req) => {
  const secret = env.emailWebhookSecret;
  const given = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-webhook-token') ?? '';
  if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw Errors.unauthorized();
  const body = (await req.json()) as unknown;
  const events: { id: string; kind: 'delivered' | 'bounced' | 'complained' | 'failed'; raw: unknown }[] = [];
  const mapKind = (t: string) =>
    /delivered/.test(t) ? 'delivered' : /bounce/.test(t) ? 'bounced' : /complain|spam/.test(t) ? 'complained' : /drop|fail|reject/.test(t) ? 'failed' : null;
  if (Array.isArray(body)) {
    for (const e of body as { event: string; sg_message_id?: string }[]) {
      const kind = mapKind(e.event);
      if (kind && e.sg_message_id) events.push({ id: e.sg_message_id.split('.')[0], kind, raw: e });
    }
  } else if (body && typeof body === 'object') {
    const b = body as { type?: string; data?: { email_id?: string }; messageId?: string; status?: string };
    const kind = mapKind(b.type ?? b.status ?? '');
    const id = b.data?.email_id ?? b.messageId;
    if (kind && id) events.push({ id, kind, raw: b });
  }
  let matched = 0;
  for (const e of events) if ((await applyProviderEvent(e.id, e.kind, e.raw)).matched) matched++;
  return json({ received: events.length, matched });
}, { csrf: false });
