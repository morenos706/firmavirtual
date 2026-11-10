import nodemailer from 'nodemailer';
import { env } from '@/lib/env';
import { putFile } from '@/lib/storage';
import { randomToken } from '@/lib/crypto';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  idempotencyKey?: string;
};

export type SendResult = { provider: string; messageId: string };

/** Error del proveedor. permanent=true → no se reintenta (p. ej., destinatario inválido). */
export class EmailSendError extends Error {
  constructor(message: string, public permanent: boolean, public providerCode?: string | number) {
    super(message);
  }
}

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<SendResult>;
}

const fromHeader = () => `"${env.emailFromName.replace(/"/g, '')}" <${env.emailFrom}>`;

/** Desarrollo: guarda el correo y sus adjuntos en storage/outbox (no envía nada). */
const fileProvider: EmailProvider = {
  name: 'file',
  async send(msg) {
    const id = `file-${Date.now()}-${randomToken(6)}`;
    const meta = { id, from: fromHeader(), to: msg.to, subject: msg.subject, text: msg.text, attachments: msg.attachments?.map((a) => a.filename) };
    await putFile(`outbox/${id}/message.json`, Buffer.from(JSON.stringify(meta, null, 2)));
    await putFile(`outbox/${id}/message.html`, Buffer.from(msg.html));
    for (const a of msg.attachments ?? []) await putFile(`outbox/${id}/${a.filename.replace(/[^\w.\-]/g, '_')}`, a.content);
    return { provider: 'file', messageId: id };
  },
};

let transporter: nodemailer.Transporter | null = null;
/** SMTP seguro (STARTTLS/TLS). También sirve para Amazon SES vía su interfaz SMTP. */
const smtpProvider: EmailProvider = {
  name: 'smtp',
  async send(msg) {
    const s = env.smtp;
    if (!s.host) throw new EmailSendError('SMTP_HOST no configurado', false);
    transporter ??= nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      requireTLS: !s.secure,
      auth: s.user ? { user: s.user, pass: s.password } : undefined,
      tls: { minVersion: 'TLSv1.2' },
    });
    try {
      const info = await transporter.sendMail({
        from: fromHeader(),
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
        headers: msg.idempotencyKey ? { 'X-FirmaQR-Key': msg.idempotencyKey } : undefined,
      });
      if (info.rejected?.length) throw new EmailSendError(`Destinatario rechazado: ${info.rejected.join(', ')}`, true);
      return { provider: 'smtp', messageId: info.messageId };
    } catch (e) {
      if (e instanceof EmailSendError) throw e;
      const err = e as { responseCode?: number; message?: string };
      // 5xx = rechazo permanente; 4xx o error de red = transitorio (se reintenta)
      const permanent = typeof err.responseCode === 'number' && err.responseCode >= 500 && err.responseCode < 600;
      throw new EmailSendError(err.message ?? 'Error SMTP', permanent, err.responseCode);
    }
  },
};

async function httpError(res: Response, provider: string): Promise<EmailSendError> {
  const body = await res.text().catch(() => '');
  const permanent = res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408;
  return new EmailSendError(`${provider} HTTP ${res.status}: ${body.slice(0, 300)}`, permanent, res.status);
}

const resendProvider: EmailProvider = {
  name: 'resend',
  async send(msg) {
    if (!env.emailApiKey) throw new EmailSendError('EMAIL_API_KEY no configurada', false);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.emailApiKey}`,
        'Content-Type': 'application/json',
        ...(msg.idempotencyKey ? { 'Idempotency-Key': msg.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: fromHeader(),
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      }),
    }).catch((e) => {
      throw new EmailSendError(`Error de red: ${e.message}`, false);
    });
    if (!res.ok) throw await httpError(res, 'Resend');
    const data = (await res.json()) as { id: string };
    return { provider: 'resend', messageId: data.id };
  },
};

const sendgridProvider: EmailProvider = {
  name: 'sendgrid',
  async send(msg) {
    if (!env.emailApiKey) throw new EmailSendError('EMAIL_API_KEY no configurada', false);
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.emailApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }], custom_args: msg.idempotencyKey ? { firmaqr_key: msg.idempotencyKey } : undefined }],
        from: { email: env.emailFrom, name: env.emailFromName },
        subject: msg.subject,
        content: [
          { type: 'text/plain', value: msg.text },
          { type: 'text/html', value: msg.html },
        ],
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
          type: a.contentType ?? 'application/pdf',
          disposition: 'attachment',
        })),
      }),
    }).catch((e) => {
      throw new EmailSendError(`Error de red: ${e.message}`, false);
    });
    if (!res.ok) throw await httpError(res, 'SendGrid');
    return { provider: 'sendgrid', messageId: res.headers.get('x-message-id') ?? `sg-${Date.now()}` };
  },
};

/** Proveedor de pruebas: permite simular fallos transitorios y permanentes. */
export const mockOutbox: { sent: EmailMessage[]; failNext: { permanent: boolean; message: string }[] } = { sent: [], failNext: [] };
const mockProvider: EmailProvider = {
  name: 'mock',
  async send(msg) {
    const f = mockOutbox.failNext.shift();
    if (f) throw new EmailSendError(f.message, f.permanent);
    mockOutbox.sent.push(msg);
    return { provider: 'mock', messageId: `mock-${mockOutbox.sent.length}-${randomToken(4)}` };
  },
};

export function getEmailProvider(): EmailProvider {
  switch (env.emailProvider) {
    case 'smtp':
    case 'ses':
      return smtpProvider;
    case 'resend':
      return resendProvider;
    case 'sendgrid':
      return sendgridProvider;
    case 'mock':
      return mockProvider;
    case 'file':
    default:
      return fileProvider;
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(email) && email.length <= 254;
}
