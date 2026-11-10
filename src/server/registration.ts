import { Prisma, type ConsentType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit, type AuditActor } from '@/lib/audit';
import { blindIndex, canonicalJson, encrypt, randomCode, randomToken, sha256 } from '@/lib/crypto';
import { AppError, Errors } from '@/lib/errors';
import { normalizeDocument, normalizeEmail, normalizeName } from '@/lib/format';
import { getActiveLegalTexts, getSettings, renderLegal } from '@/lib/settings';
import { putFile } from '@/lib/storage';
import { registrationSchema } from '@/lib/validation';
import { checkOtp, issueOtp } from './otp';

const REGISTRATION_TTL_MS = 2 * 3600_000;
const MAX_SIGNATURE_BYTES = 1_500_000;

export type ClientMeta = { ip: string | null; userAgent: string | null };

const participantActor = (meta: ClientMeta, label?: string): AuditActor => ({
  type: 'PARTICIPANT',
  label: label ?? null,
  ip: meta.ip,
  userAgent: meta.userAgent,
});

async function loadByQrToken(token: string) {
  const qr = await prisma.eventQr.findUnique({
    where: { token },
    include: { event: { include: { fields: { orderBy: { order: 'asc' } } } } },
  });
  if (!qr) throw Errors.notFound('Código QR');
  return qr;
}

function registrationAvailability(qr: { active: boolean; event: { status: string } }) {
  if (qr.event.status === 'FINALIZED') return { open: false, reason: 'El evento ya finalizó. No se admiten nuevos registros.' };
  if (qr.event.status === 'CANCELLED') return { open: false, reason: 'El evento fue cancelado.' };
  if (!qr.active) return { open: false, reason: 'El código QR de este evento está desactivado.' };
  if (qr.event.status !== 'ACTIVE') return { open: false, reason: 'El registro de asistencia aún no está habilitado para este evento.' };
  return { open: true, reason: null };
}

/** Información pública del evento (sin datos personales). */
export async function getPublicEvent(token: string) {
  const qr = await loadByQrToken(token);
  const ev = qr.event;
  const settings = await getSettings();
  const legal = await getActiveLegalTexts();
  const availability = registrationAvailability(qr);
  if (availability.open) await prisma.eventQr.update({ where: { id: qr.id }, data: { scans: { increment: 1 } } });
  return {
    company: { name: settings.companyName, hasLogo: Boolean(settings.logoPath) },
    event: {
      name: ev.name,
      program: ev.program,
      topic: ev.topic,
      trainer: ev.trainer,
      institution: ev.institution,
      date: ev.date.toISOString().slice(0, 10),
      startTime: ev.startTime,
      endTime: ev.endTime,
      location: ev.location,
      otpChannel: ev.otpChannel,
      requireDataConsent: ev.requireDataConsent,
    },
    fields: ev.fields.filter((f) => f.enabled).map((f) => ({ key: f.key, label: f.label, required: f.required })),
    legal: {
      agreement: legal.agreement && {
        id: legal.agreement.id,
        version: legal.agreement.version,
        title: legal.agreement.title,
        content: renderLegal(legal.agreement.content, settings.companyName),
      },
      dataTreatment:
        ev.requireDataConsent && legal.data
          ? { id: legal.data.id, version: legal.data.version, title: legal.data.title, content: renderLegal(legal.data.content, settings.companyName) }
          : null,
    },
    availability,
  };
}

/** Paso 1-4: datos del participante + envío de OTP. */
export async function startRegistration(token: string, rawInput: unknown, meta: ClientMeta) {
  const qr = await loadByQrToken(token);
  const ev = qr.event;
  const av = registrationAvailability(qr);
  if (!av.open) throw Errors.gone('REGISTRATION_CLOSED', av.reason!);

  const input = registrationSchema.parse(rawInput);
  const enabled = new Map(ev.fields.map((f) => [f.key, f]));
  const missing: { path: string; message: string }[] = [];
  for (const f of ev.fields) {
    if (!f.enabled || !f.required) continue;
    const v = (input as Record<string, unknown>)[f.key];
    if (v === undefined || v === null || String(v).trim() === '') missing.push({ path: f.key, message: `${f.label} es obligatorio` });
  }
  if (ev.otpChannel === 'SMS' && !input.phone) missing.push({ path: 'phone', message: 'El número de celular es obligatorio para la verificación por SMS' });
  if (missing.length) throw Errors.badRequest('Complete los campos obligatorios.', missing);

  const docNorm = normalizeDocument(input.documentNumber);
  const docHash = blindIndex(`doc:${docNorm}`);
  const emailNorm = normalizeEmail(input.email);
  const pick = (k: 'company' | 'management' | 'area') => (enabled.get(k)?.enabled ? normalizeName(input[k] ?? '') || null : null);
  const phone = enabled.get('phone')?.enabled || ev.otpChannel === 'SMS' ? (input.phone || '').replace(/\s/g, '') || null : null;

  // Control de duplicados según las reglas del evento
  const existing = await prisma.attendanceRecord.findFirst({
    where: { eventId: ev.id, documentNumberHash: docHash, status: { not: 'VOIDED' } },
    include: { attendee: true },
  });
  if (existing?.status === 'COMPLETED')
    throw Errors.conflict('DUPLICATE_ATTENDANCE', 'Ya existe un registro de asistencia firmado con este número de identificación para este evento.');
  if (ev.duplicateRule === 'DOCUMENT_AND_EMAIL') {
    const byEmail = await prisma.attendanceRecord.findFirst({
      where: { eventId: ev.id, emailNormalized: emailNorm, status: 'COMPLETED' },
    });
    if (byEmail) throw Errors.conflict('DUPLICATE_ATTENDANCE', 'Ya existe un registro de asistencia firmado con este correo electrónico para este evento.');
  }

  const regToken = randomToken(32);
  const attendeeData = {
    documentNumberEnc: encrypt(docNorm),
    documentNumberHash: docHash,
    fullName: normalizeName(input.fullName),
    company: pick('company'),
    management: pick('management'),
    area: pick('area'),
    email: input.email.trim(),
    emailNormalized: emailNorm,
    phoneEnc: phone ? encrypt(phone) : null,
    phoneLast4: phone ? phone.slice(-4) : null,
  };

  const record = await prisma.$transaction(async (tx) => {
    let rec;
    if (existing) {
      // Registro previo no finalizado: se reemplazan los datos y se reinicia la verificación.
      await tx.attendee.update({ where: { id: existing.attendeeId }, data: attendeeData });
      rec = await tx.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          status: 'STARTED',
          emailNormalized: emailNorm,
          registrationTokenHash: sha256(regToken),
          registrationExpiresAt: new Date(Date.now() + REGISTRATION_TTL_MS),
          otpVerifiedAt: null,
          authMethod: null,
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 500),
        },
        include: { attendee: true },
      });
    } else {
      const attendee = await tx.attendee.create({ data: { ...attendeeData, eventId: ev.id } });
      rec = await tx.attendanceRecord.create({
        data: {
          evidenceCode: randomCode(),
          eventId: ev.id,
          attendeeId: attendee.id,
          documentNumberHash: docHash,
          emailNormalized: emailNorm,
          registrationTokenHash: sha256(regToken),
          registrationExpiresAt: new Date(Date.now() + REGISTRATION_TTL_MS),
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 500),
        },
        include: { attendee: true },
      });
    }
    await audit(
      participantActor(meta, attendeeData.fullName),
      { action: existing ? 'REGISTRATION_RESTARTED' : 'REGISTRATION_STARTED', entityType: 'attendance_record', entityId: rec.id, eventId: ev.id },
      tx,
    );
    return rec;
  }).catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw Errors.conflict('DUPLICATE_ATTENDANCE', 'Ya existe un registro en curso con este número de identificación.');
    throw e;
  });

  const otp = await issueOtp(record, ev, meta.ip);
  return { registrationToken: regToken, otp };
}

async function loadRegistration(regToken: string | null) {
  if (!regToken) throw Errors.unauthorized();
  const rec = await prisma.attendanceRecord.findUnique({
    where: { registrationTokenHash: sha256(regToken) },
    include: { attendee: true, event: true, consents: true },
  });
  if (!rec) throw new AppError(401, 'REGISTRATION_INVALID', 'Sesión de registro inválida. Escanee nuevamente el código QR.');
  if (rec.registrationExpiresAt < new Date()) throw Errors.gone('REGISTRATION_EXPIRED', 'La sesión de registro expiró. Escanee nuevamente el código QR.');
  if (rec.event.status !== 'ACTIVE') throw Errors.gone('REGISTRATION_CLOSED', 'El evento ya no admite registros.');
  return rec;
}

export async function resendOtp(regToken: string | null, meta: ClientMeta) {
  const rec = await loadRegistration(regToken);
  if (rec.status !== 'STARTED') throw Errors.conflict('ALREADY_VERIFIED', 'La verificación ya fue completada.');
  return issueOtp(rec, rec.event, meta.ip);
}

export async function verifyRegistrationOtp(regToken: string | null, code: string, meta: ClientMeta) {
  const rec = await loadRegistration(regToken);
  if (rec.status !== 'STARTED') throw Errors.conflict('ALREADY_VERIFIED', 'La verificación ya fue completada.');
  try {
    const otp = await checkOtp(rec.id, code.trim());
    await prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.update({
        where: { id: rec.id },
        data: {
          status: 'OTP_VERIFIED',
          otpVerifiedAt: otp.verifiedAt,
          authMethod: otp.channel === 'SMS' ? 'SMS_OTP' : 'EMAIL_OTP',
          authDestinationMasked: otp.destinationMasked,
        },
      });
      await audit(
        participantActor(meta, rec.attendee.fullName),
        { action: 'OTP_VERIFIED', entityType: 'attendance_record', entityId: rec.id, eventId: rec.eventId, details: { channel: otp.channel, otpId: otp.id } },
        tx,
      );
    });
    return { verified: true };
  } catch (e) {
    await audit(participantActor(meta, rec.attendee.fullName), {
      action: 'OTP_FAILED',
      entityType: 'attendance_record',
      entityId: rec.id,
      eventId: rec.eventId,
      details: { reason: (e as Error).message },
    });
    throw e;
  }
}

/** Paso 5-7: manifestación expresa de voluntad, con la versión y huella del texto aceptado. */
export async function acceptConsent(regToken: string | null, type: ConsentType, legalTextId: string, accepted: boolean, meta: ClientMeta) {
  const rec = await loadRegistration(regToken);
  if (rec.status !== 'OTP_VERIFIED') throw Errors.conflict('OTP_REQUIRED', 'Primero debe verificar su identidad con el código OTP.');
  if (!accepted) throw Errors.badRequest('Debe aceptar expresamente el texto para continuar.');
  const text = await prisma.legalText.findUnique({ where: { id: legalTextId } });
  if (!text || text.type !== type || !text.active) throw Errors.badRequest('La versión del texto jurídico no es válida o no está vigente.');
  const existing = rec.consents.find((c) => c.type === type);
  if (existing) return existing;
  return prisma.$transaction(async (tx) => {
    const c = await tx.consentRecord.create({
      data: {
        attendanceRecordId: rec.id,
        type,
        legalTextId: text.id,
        version: text.version,
        textSha256: text.sha256,
        accepted: true,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
      },
    });
    await audit(
      participantActor(meta, rec.attendee.fullName),
      { action: 'CONSENT_ACCEPTED', entityType: 'consent_record', entityId: c.id, eventId: rec.eventId, details: { type, version: text.version, textSha256: text.sha256 } },
      tx,
    );
    return c;
  });
}

export type SignaturePayload = {
  imageDataUrl: string;
  strokeCount: number;
  pointCount: number;
  drawDurationMs?: number | null;
  pointerType?: string | null;
  device?: Record<string, unknown> | null;
};

function parsePng(dataUrl: string) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw Errors.badRequest('Formato de firma inválido.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_SIGNATURE_BYTES) throw Errors.badRequest('La imagen de la firma es demasiado grande.');
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig) || buf.toString('ascii', 12, 16) !== 'IHDR')
    throw Errors.badRequest('La imagen de la firma no es un PNG válido.');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width < 200 || height < 80 || width > 4000 || height > 2000) throw Errors.badRequest('Dimensiones de firma no válidas.');
  return { buf, width, height };
}

/** Pasos 8-10: firma manuscrita + confirmación. Consolida y sella el paquete de evidencia. */
export async function completeRegistration(regToken: string | null, payload: SignaturePayload, meta: ClientMeta) {
  const rec = await loadRegistration(regToken);
  if (rec.status === 'COMPLETED') throw Errors.conflict('ALREADY_COMPLETED', 'Este registro ya fue firmado.');
  if (rec.status !== 'OTP_VERIFIED') throw Errors.conflict('OTP_REQUIRED', 'Debe verificar su identidad antes de firmar.');
  const agreement = rec.consents.find((c) => c.type === 'SIGNATURE_AGREEMENT');
  if (!agreement) throw Errors.conflict('CONSENT_REQUIRED', 'Debe aceptar el acuerdo de firma electrónica.');
  const dataConsent = rec.consents.find((c) => c.type === 'DATA_TREATMENT');
  if (rec.event.requireDataConsent && !dataConsent)
    throw Errors.conflict('CONSENT_REQUIRED', 'Debe aceptar la autorización de tratamiento de datos personales.');
  if (!Number.isInteger(payload.strokeCount) || payload.strokeCount < 1 || !Number.isInteger(payload.pointCount) || payload.pointCount < 10)
    throw Errors.badRequest('La firma está vacía o es demasiado corta. Firme nuevamente.');

  const { buf, width, height } = parsePng(payload.imageDataUrl);
  const stored = await putFile(`signatures/${rec.eventId}/${rec.id}.png`, buf);
  const capturedAt = new Date();
  const otp = await prisma.otpVerification.findFirst({ where: { attendanceRecordId: rec.id, status: 'VERIFIED' }, orderBy: { verifiedAt: 'desc' } });

  const evidence = {
    schema: 'firmaqr.evidence.v1',
    record: { id: rec.id, evidenceCode: rec.evidenceCode },
    event: {
      id: rec.event.id,
      code: rec.event.code,
      name: rec.event.name,
      program: rec.event.program,
      topic: rec.event.topic,
      date: rec.event.date.toISOString().slice(0, 10),
    },
    signer: {
      fullName: rec.attendee.fullName,
      documentNumberHash: rec.attendee.documentNumberHash,
      emailHash: blindIndex(`email:${rec.attendee.emailNormalized}`),
      company: rec.attendee.company,
      management: rec.attendee.management,
      area: rec.attendee.area,
    },
    authentication: {
      method: rec.authMethod,
      destinationMasked: rec.authDestinationMasked,
      otpId: otp?.id ?? null,
      verifiedAt: rec.otpVerifiedAt?.toISOString() ?? null,
    },
    consents: rec.consents
      .map((c) => ({ type: c.type, version: c.version, textSha256: c.textSha256, acceptedAt: c.acceptedAt.toISOString() }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    signature: {
      imageSha256: stored.sha256,
      width,
      height,
      strokeCount: payload.strokeCount,
      pointCount: payload.pointCount,
      drawDurationMs: payload.drawDurationMs ?? null,
      pointerType: payload.pointerType ?? null,
      capturedAt: capturedAt.toISOString(),
    },
    client: { ip: meta.ip, userAgent: meta.userAgent },
    completedAt: capturedAt.toISOString(),
  };
  const evidenceHash = sha256(canonicalJson(evidence));

  await prisma.$transaction(async (tx) => {
    await tx.signature.create({
      data: {
        attendanceRecordId: rec.id,
        imagePath: stored.path,
        imageSha256: stored.sha256,
        width,
        height,
        strokeCount: payload.strokeCount,
        pointCount: payload.pointCount,
        drawDurationMs: payload.drawDurationMs ?? null,
        pointerType: payload.pointerType?.slice(0, 20) ?? null,
        deviceInfo: (payload.device ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
        capturedAt,
      },
    });
    await tx.attendanceRecord.update({
      where: { id: rec.id },
      data: { status: 'COMPLETED', completedAt: capturedAt, evidenceJson: evidence as Prisma.InputJsonValue, evidenceHash, registrationExpiresAt: new Date() },
    });
    await audit(
      participantActor(meta, rec.attendee.fullName),
      {
        action: 'ATTENDANCE_SIGNED',
        entityType: 'attendance_record',
        entityId: rec.id,
        eventId: rec.eventId,
        details: { evidenceCode: rec.evidenceCode, evidenceHash, signatureSha256: stored.sha256 },
      },
      tx,
    );
  });

  return { evidenceCode: rec.evidenceCode, evidenceHash, completedAt: capturedAt, fullName: rec.attendee.fullName, eventName: rec.event.name };
}
