export const TZ = 'America/Bogota';

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha de evento (columna DATE, almacenada como UTC 00:00) → DD/MM/AA (formato del documento institucional). */
export function fmtEventDateShort(d: Date | string): string {
  const x = new Date(d);
  return `${pad(x.getUTCDate())}/${pad(x.getUTCMonth() + 1)}/${String(x.getUTCFullYear()).slice(-2)}`;
}

export function fmtEventDateLong(d: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));
}

export function fmtEventDateISO(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Marca de tiempo en hora de Colombia. */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(d));
}

export function fmtTime(d: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const u = user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '*'.repeat(Math.min(6, user.length - 2));
  return `${u}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `*** *** ${digits.slice(-4)}`;
}

export function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + '***')
    .join(' ');
}

export function maskDocument(doc: string): string {
  return doc.length <= 4 ? '****' : '*'.repeat(doc.length - 4) + doc.slice(-4);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDocument(doc: string): string {
  return doc.replace(/[\s.\-]/g, '').toUpperCase();
}

export function normalizeName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Programado',
  ACTIVE: 'Activo',
  FINALIZED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export const EMAIL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  RETRYING: 'Reintentando',
  SENT_TO_PROVIDER: 'Enviado al proveedor',
  DELIVERED: 'Entregado',
  REJECTED: 'Rechazado',
  FAILED: 'Fallido',
  CANCELLED: 'Cancelado',
};

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  STARTED: 'Registro iniciado',
  OTP_VERIFIED: 'Verificado (sin firma)',
  COMPLETED: 'Firmado',
  VOIDED: 'Anulado',
};

export const CLASSIFICATION_LABELS: Record<string, string> = { INTERNAL: 'Interno', EXTERNAL: 'Externo' };
