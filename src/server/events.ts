import { Prisma, type EventStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit, type AuditActor } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import { Errors } from '@/lib/errors';
import { DEFAULT_FIELDS, FIXED_FIELDS } from '@/lib/fields';
import { randomToken } from '@/lib/crypto';
import { loadEventFor } from '@/lib/permissions';
import type { EventInput } from '@/lib/validation';

const EVIDENCE_FIELDS = [
  'program', 'topic', 'relatedDocument', 'name', 'trainer', 'institution', 'classification',
  'date', 'startTime', 'endTime', 'durationHours',
] as const;
/** Campos que un ADMIN puede corregir después del cierre (con justificación auditada). */
const POST_CLOSE_CORRECTABLE = ['description', 'location'] as const;

function normalizeFields(fields: EventInput['fields']) {
  const base = new Map(DEFAULT_FIELDS.map((f) => [f.key, { ...f }]));
  for (const f of fields ?? []) {
    const cur = base.get(f.key as never);
    if (cur) Object.assign(cur, { label: f.label, enabled: f.enabled, required: f.enabled && f.required, order: f.order });
  }
  for (const k of FIXED_FIELDS) Object.assign(base.get(k)!, { enabled: true, required: true });
  return [...base.values()];
}

async function nextEventCode(tx: Prisma.TransactionClient, year: number) {
  const prefix = `EV-${year}-`;
  const last = await tx.event.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } });
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, '0')}`;
}

async function resolveOrganizer(user: SessionUser, organizerId?: string) {
  if (!organizerId || organizerId === user.id) return user.id;
  if (user.role !== 'ADMIN') throw Errors.forbidden('Solo un administrador puede asignar otro organizador.');
  const org = await prisma.user.findUnique({ where: { id: organizerId } });
  if (!org || !org.active) throw Errors.badRequest('Organizador inválido.');
  return org.id;
}

export async function createEvent(user: SessionUser, input: EventInput, actor: AuditActor) {
  const organizerId = await resolveOrganizer(user, input.organizerId);
  const fields = normalizeFields(input.fields);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const code = await nextEventCode(tx, Number(input.date.slice(0, 4)));
        const ev = await tx.event.create({
          data: {
            code,
            program: input.program,
            topic: input.topic,
            relatedDocument: input.relatedDocument,
            name: input.name,
            description: input.description,
            trainer: input.trainer,
            institution: input.institution,
            classification: input.classification,
            date: new Date(`${input.date}T00:00:00Z`),
            startTime: input.startTime,
            endTime: input.endTime,
            durationHours: new Prisma.Decimal(input.durationHours),
            location: input.location,
            otpChannel: input.otpChannel,
            requireDataConsent: input.requireDataConsent,
            duplicateRule: input.duplicateRule,
            organizerId,
            createdById: user.id,
            fields: { create: fields },
            qr: { create: { token: randomToken(24), active: true } },
          },
        });
        await audit(actor, { action: 'EVENT_CREATED', entityType: 'event', entityId: ev.id, eventId: ev.id, details: { code, name: ev.name } }, tx);
        return ev;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error('No fue posible generar el código del evento');
}

function serializeForDiff(v: unknown) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v instanceof Prisma.Decimal) return v.toNumber();
  return v ?? null;
}

export async function updateEvent(
  user: SessionUser,
  eventId: string,
  input: EventInput,
  actor: AuditActor,
  justification?: string | null,
) {
  const ev = await loadEventFor(user, eventId, 'manage');
  if (ev.status === 'CANCELLED') throw Errors.conflict('EVENT_CANCELLED', 'El evento está cancelado y no admite modificaciones.');

  const next: Record<string, unknown> = {
    program: input.program,
    topic: input.topic,
    relatedDocument: input.relatedDocument,
    name: input.name,
    description: input.description,
    trainer: input.trainer,
    institution: input.institution,
    classification: input.classification,
    date: new Date(`${input.date}T00:00:00Z`),
    startTime: input.startTime,
    endTime: input.endTime,
    durationHours: new Prisma.Decimal(input.durationHours),
    location: input.location,
  };
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(next)) {
    const a = serializeForDiff((ev as Record<string, unknown>)[k]);
    const b = serializeForDiff(v);
    if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = { from: a, to: b };
  }

  if (ev.status === 'FINALIZED') {
    if (user.role !== 'ADMIN') throw Errors.forbidden('El evento está finalizado. Solo un administrador puede registrar correcciones.');
    const blocked = Object.keys(diff).filter((k) => !(POST_CLOSE_CORRECTABLE as readonly string[]).includes(k));
    if (blocked.length)
      throw Errors.conflict('EVENT_LOCKED', `El evento está finalizado: no se pueden modificar campos que forman parte de la evidencia (${blocked.join(', ')}).`);
    if (!justification || justification.trim().length < 10)
      throw Errors.badRequest('Toda corrección posterior al cierre requiere una justificación (mínimo 10 caracteres).');
    if (Object.keys(diff).length === 0) return ev;
    return prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({ where: { id: ev.id }, data: { description: input.description, location: input.location } });
      await audit(actor, { action: 'EVENT_POST_CLOSE_CORRECTION', entityType: 'event', entityId: ev.id, eventId: ev.id, details: { diff, justification } }, tx);
      return updated;
    });
  }

  const organizerId = input.organizerId ? await resolveOrganizer(user, input.organizerId) : ev.organizerId;
  if (organizerId !== ev.organizerId) diff.organizerId = { from: ev.organizerId, to: organizerId };
  const fields = input.fields ? normalizeFields(input.fields) : null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: ev.id },
      data: {
        ...(next as Prisma.EventUpdateInput),
        organizer: { connect: { id: organizerId } },
        otpChannel: input.otpChannel,
        requireDataConsent: input.requireDataConsent,
        duplicateRule: input.duplicateRule,
      },
    });
    if (fields) {
      for (const f of fields) {
        await tx.eventField.upsert({
          where: { eventId_key: { eventId: ev.id, key: f.key } },
          create: { ...f, eventId: ev.id },
          update: { label: f.label, enabled: f.enabled, required: f.required, order: f.order },
        });
      }
    }
    const evidenceTouched = Object.keys(diff).some((k) => (EVIDENCE_FIELDS as readonly string[]).includes(k));
    await audit(
      actor,
      {
        action: 'EVENT_UPDATED',
        entityType: 'event',
        entityId: ev.id,
        eventId: ev.id,
        details: { diff, settings: { otpChannel: input.otpChannel, requireDataConsent: input.requireDataConsent, duplicateRule: input.duplicateRule }, evidenceTouched },
      },
      tx,
    );
    return updated;
  });
}

const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['SCHEDULED', 'ACTIVE', 'CANCELLED'],
  SCHEDULED: ['DRAFT', 'ACTIVE', 'CANCELLED'],
  ACTIVE: ['SCHEDULED', 'CANCELLED'], // FINALIZED solo mediante el proceso de cierre
  FINALIZED: [],
  CANCELLED: [],
};

export async function changeEventStatus(user: SessionUser, eventId: string, target: EventStatus, actor: AuditActor, reason?: string) {
  const ev = await loadEventFor(user, eventId, 'manage');
  if (target === 'FINALIZED') throw Errors.badRequest('Para finalizar utilice la opción CERRAR EVENTO.');
  if (!TRANSITIONS[ev.status].includes(target))
    throw Errors.conflict('INVALID_TRANSITION', `No se puede pasar de ${ev.status} a ${target}.`);
  if (target === 'CANCELLED') {
    const signed = await prisma.attendanceRecord.count({ where: { eventId, status: 'COMPLETED' } });
    if (signed > 0 && (!reason || reason.trim().length < 10))
      throw Errors.badRequest('El evento tiene firmas registradas: indique una justificación para cancelarlo (mínimo 10 caracteres).');
  }
  return prisma.$transaction(async (tx) => {
    const res = await tx.event.updateMany({ where: { id: eventId, status: ev.status }, data: { status: target } });
    if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'El estado del evento cambió. Recargue la página.');
    await audit(actor, { action: 'EVENT_STATUS_CHANGED', entityType: 'event', entityId: eventId, eventId, details: { from: ev.status, to: target, reason: reason ?? null } }, tx);
    return tx.event.findUniqueOrThrow({ where: { id: eventId } });
  });
}

export async function setQrActive(user: SessionUser, eventId: string, active: boolean, actor: AuditActor) {
  const ev = await loadEventFor(user, eventId, 'manage');
  if (active && (ev.status === 'FINALIZED' || ev.status === 'CANCELLED'))
    throw Errors.conflict('EVENT_CLOSED', 'No se puede activar el QR de un evento finalizado o cancelado.');
  return prisma.$transaction(async (tx) => {
    const qr = await tx.eventQr.update({ where: { eventId }, data: { active, deactivatedAt: active ? null : new Date() } });
    await audit(actor, { action: active ? 'QR_ACTIVATED' : 'QR_DEACTIVATED', entityType: 'event_qr', entityId: qr.id, eventId }, tx);
    return qr;
  });
}

/** Regenera el identificador del QR (invalida los QR impresos anteriormente). */
export async function rotateQr(user: SessionUser, eventId: string, actor: AuditActor) {
  const ev = await loadEventFor(user, eventId, 'manage');
  if (ev.status === 'FINALIZED' || ev.status === 'CANCELLED') throw Errors.conflict('EVENT_CLOSED', 'Evento cerrado.');
  return prisma.$transaction(async (tx) => {
    const qr = await tx.eventQr.update({ where: { eventId }, data: { token: randomToken(24), rotatedAt: new Date() } });
    await audit(actor, { action: 'QR_ROTATED', entityType: 'event_qr', entityId: qr.id, eventId }, tx);
    return qr;
  });
}

export function registrationUrl(appUrl: string, token: string) {
  return `${appUrl}/r/${token}`;
}
