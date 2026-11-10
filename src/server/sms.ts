import { env } from '@/lib/env';
import { maskPhone } from '@/lib/format';

export const smsOutbox: { to: string; body: string }[] = [];

/** Envío de SMS (OTP). Proveedores: console (desarrollo) o twilio. */
export async function sendSms(to: string, body: string): Promise<{ provider: string; messageId: string }> {
  if (env.smsProvider === 'twilio') {
    const t = env.twilio;
    if (!t.accountSid || !t.authToken || !t.from) throw new Error('Credenciales de Twilio no configuradas');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${t.accountSid}:${t.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: t.from, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio HTTP ${res.status}`);
    const data = (await res.json()) as { sid: string };
    return { provider: 'twilio', messageId: data.sid };
  }
  smsOutbox.push({ to, body });
  if (process.env.NODE_ENV !== 'test') console.info(`[sms:console] → ${maskPhone(to)}: ${body}`);
  return { provider: 'console', messageId: `console-${Date.now()}` };
}

/** Normaliza celulares colombianos a formato E.164 (+57...). */
export function toE164(phone: string): string {
  const d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.length === 10 && d.startsWith('3')) return `+57${d}`;
  return `+${d}`;
}
