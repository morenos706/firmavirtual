import crypto from 'node:crypto';

function required(name: string, fallbackForDev?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (process.env.NODE_ENV !== 'production' && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Variable de entorno requerida no configurada: ${name}`);
}

function deriveDevKey(label: string) {
  return crypto.createHash('sha256').update(`firmaqr-dev-${label}`).digest('base64');
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  },
  get encryptionKey(): Buffer {
    const raw = required('APP_ENCRYPTION_KEY', deriveDevKey('enc'));
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY debe ser de 32 bytes codificados en base64');
    return buf;
  },
  get hashPepper() {
    return required('HASH_PEPPER', 'dev-pepper');
  },
  get otpSecret() {
    return required('OTP_SECRET', 'dev-otp-secret');
  },
  get storageDir() {
    return process.env.STORAGE_DIR || './storage';
  },
  get emailProvider() {
    return (process.env.EMAIL_PROVIDER || 'file').toLowerCase();
  },
  get emailFrom() {
    return process.env.EMAIL_FROM || 'no-reply@firmaqr.local';
  },
  get emailFromName() {
    return process.env.EMAIL_FROM_NAME || 'FirmaQR';
  },
  get emailApiKey() {
    return process.env.EMAIL_API_KEY || '';
  },
  get emailWebhookSecret() {
    return process.env.EMAIL_WEBHOOK_SECRET || '';
  },
  get smtp() {
    return {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    };
  },
  get smsProvider() {
    return (process.env.SMS_PROVIDER || 'console').toLowerCase();
  },
  get twilio() {
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM || '',
    };
  },
  get queueInline() {
    return process.env.QUEUE_INLINE !== 'false';
  },
  get sessionHours() {
    return Number(process.env.SESSION_HOURS || 8);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  get trustProxy() {
    return process.env.TRUST_PROXY === 'true' || Boolean(process.env.VERCEL);
  },
};
