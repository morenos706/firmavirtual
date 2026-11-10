import { prisma } from '@/lib/db';
import { hashPassword, type SessionUser } from '@/lib/auth';
import type { AuditActor } from '@/lib/audit';
import { DEFAULT_DATA_TREATMENT, DEFAULT_SIGNATURE_AGREEMENT } from '@/lib/legal-defaults';
import { sha256 } from '@/lib/crypto';
import { createEvent, changeEventStatus } from '@/server/events';
import { acceptConsent, completeRegistration, startRegistration, verifyRegistrationOtp } from '@/server/registration';
import { mockOutbox } from '@/server/email/providers';
import type { EventInput } from '@/lib/validation';

export async function resetDb() {
  const tables = [
    'notification_logs', 'email_jobs', 'documents', 'consent_records', 'otp_verifications', 'signatures',
    'attendance_records', 'attendees', 'event_qr', 'event_fields', 'audit_logs', 'events', 'sessions', 'legal_texts', 'users', 'roles', 'app_settings',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.role.createMany({ data: [{ name: 'ADMIN', label: 'Administrador' }, { name: 'ORGANIZER', label: 'Organizador' }] });
  await prisma.appSettings.create({ data: { id: 1, companyName: 'Empresa de Pruebas S.A.S.' } });
  for (const [type, t] of [['SIGNATURE_AGREEMENT', DEFAULT_SIGNATURE_AGREEMENT], ['DATA_TREATMENT', DEFAULT_DATA_TREATMENT]] as const) {
    await prisma.legalText.create({ data: { type, version: t.version, title: t.title, content: t.content, sha256: sha256(t.content), active: true } });
  }
  mockOutbox.sent.length = 0;
  mockOutbox.failNext.length = 0;
}

export async function makeUser(role: 'ADMIN' | 'ORGANIZER', email = `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.co`, password = 'Clave-Segura-2026'): Promise<SessionUser> {
  const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const u = await prisma.user.create({ data: { email, name: `Usuario ${role}`, roleId: r.id, passwordHash: await hashPassword(password) } });
  return { id: u.id, email: u.email, name: u.name, role };
}

export const actorOf = (u: SessionUser): AuditActor => ({ type: 'USER', userId: u.id, label: u.email, ip: '127.0.0.1', userAgent: 'vitest' });
export const meta = { ip: '10.0.0.1', userAgent: 'Mozilla/5.0 (vitest)' };

export function eventInput(over: Partial<EventInput> = {}): EventInput {
  return {
    program: 'Programa BPM',
    topic: 'Inducción en Buenas Prácticas de Manufactura',
    relatedDocument: 'PR-CAL-014',
    name: 'Inducción BPM 2026',
    description: 'Capacitación obligatoria',
    trainer: 'Carolina Vélez',
    institution: 'SENA',
    classification: 'INTERNAL',
    date: '2026-11-10',
    startTime: '08:00',
    endTime: '10:00',
    durationHours: 2,
    location: 'Auditorio principal',
    otpChannel: 'EMAIL',
    requireDataConsent: true,
    duplicateRule: 'DOCUMENT',
    ...over,
  };
}

export async function activeEvent(owner: SessionUser, over: Partial<EventInput> = {}) {
  const ev = await createEvent(owner, eventInput(over), actorOf(owner));
  await changeEventStatus(owner, ev.id, 'ACTIVE', actorOf(owner));
  const qr = await prisma.eventQr.findUniqueOrThrow({ where: { eventId: ev.id } });
  return { event: ev, token: qr.token };
}

export { makePng } from './png';
import { makePng } from './png';

export function lastOtpFor(email: string): string {
  const msg = [...mockOutbox.sent].reverse().find((m) => m.to === email && m.subject.includes('verificación'));
  if (!msg) throw new Error(`No hay OTP para ${email}`);
  return /(\d{6})/.exec(msg.subject)![1];
}

export const SIGNATURE = () => ({ imageDataUrl: makePng(), strokeCount: 3, pointCount: 120, drawDurationMs: 1800, pointerType: 'touch' });

const NAMES = ['María José', 'Juan Camilo', 'Luz Ángela', 'Andrés Felipe', 'Sofía', 'Ñusta Valentina'];
export function alpha(i: number) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function registerParticipant(token: string, i: number, over: Record<string, string> = {}) {
  const data = {
    documentNumber: String(1_000_000 + i),
    fullName: `${NAMES[i % NAMES.length]} ${alpha(i)} Pérez`,
    company: 'Empresa Demo',
    management: 'Gerencia Técnica',
    area: 'Calidad',
    email: `p${i}@correo.co`,
    ...over,
  };
  const start = await startRegistration(token, data, meta);
  await verifyRegistrationOtp(start.registrationToken, lastOtpFor(data.email.toLowerCase()), meta);
  const texts = await prisma.legalText.findMany({ where: { active: true } });
  for (const t of texts) await acceptConsent(start.registrationToken, t.type, t.id, true, meta);
  const done = await completeRegistration(start.registrationToken, SIGNATURE(), meta);
  return { ...done, regToken: start.registrationToken, data };
}
