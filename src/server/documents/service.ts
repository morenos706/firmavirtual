import { Prisma, type DocumentType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { decrypt, randomCode, randomToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import {
  ATTENDANCE_STATUS_LABELS,
  CLASSIFICATION_LABELS,
  EMAIL_STATUS_LABELS,
  STATUS_LABELS,
  fmtDateTime,
  fmtEventDateLong,
  fmtEventDateShort,
} from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { fileExists, getFile, putFile } from '@/lib/storage';
import { renderAttendanceSheet, type SheetRow } from './sheet-pdf';
import { renderReceipt } from './receipt-pdf';
import { attendanceWorkbook, closingReportWorkbook, type AttendanceExportRow, type ClosingMetrics } from './excel';
import { renderClosingReport } from './report-pdf';

export async function loadLogo(): Promise<Buffer | null> {
  const s = await getSettings();
  if (!s.logoPath) return null;
  try {
    return await getFile(s.logoPath);
  } catch {
    return null;
  }
}

export function verifyUrl(code: string) {
  return `${env.appUrl}/verificar/${encodeURIComponent(code)}`;
}

function fmtHours(d: Prisma.Decimal | number) {
  const n = typeof d === 'number' ? d : d.toNumber();
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '').replace('.', ',');
}

/** Asistencias firmadas, en el orden consecutivo de la planilla. */
export async function completedRecords(eventId: string) {
  return prisma.attendanceRecord.findMany({
    where: { eventId, status: 'COMPLETED' },
    include: { attendee: true, signature: true, consents: true },
    orderBy: [{ sequence: { sort: 'asc', nulls: 'last' } }, { completedAt: 'asc' }, { id: 'asc' }],
  });
}

async function sheetRows(eventId: string, withSignature: boolean): Promise<SheetRow[]> {
  const recs = await completedRecords(eventId);
  const sigs = await Promise.all(
    recs.map((r) => (withSignature && r.signature ? getFile(r.signature.imagePath).catch(() => null) : Promise.resolve(null))),
  );
  return recs.map((r, i) => ({
    signature: sigs[i],
    sequence: r.sequence ?? i + 1,
    documentNumber: decrypt(r.attendee.documentNumberEnc),
    fullName: r.attendee.fullName,
    company: r.attendee.company,
    management: r.attendee.management,
    area: r.attendee.area,
    evidenceCode: r.evidenceCode,
  }));
}

export async function buildSheet(eventId: string, opts: { draft: boolean; verificationCode: string }) {
  const [ev, settings, logo] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    getSettings(),
    loadLogo(),
  ]);
  const rows = await sheetRows(eventId, settings.sheetShowSignature);
  return renderAttendanceSheet({
    showSignature: settings.sheetShowSignature,
    companyName: settings.companyName,
    logo,
    formatCode: settings.formatCode,
    formatVersion: settings.formatVersion,
    title: settings.sheetTitle,
    event: {
      code: ev.code,
      program: ev.program,
      topic: ev.topic,
      relatedDocument: ev.relatedDocument,
      trainer: ev.trainer,
      institution: ev.institution,
      classification: ev.classification,
      dateShort: fmtEventDateShort(ev.date),
      startTime: ev.startTime,
      endTime: ev.endTime,
      durationHours: fmtHours(ev.durationHours),
    },
    rows,
    verificationCode: opts.verificationCode,
    verifyUrl: verifyUrl(opts.verificationCode),
    draft: opts.draft,
    generatedAt: fmtDateTime(new Date()),
  });
}

export async function buildReceipt(recordId: string) {
  const rec = await prisma.attendanceRecord.findUniqueOrThrow({
    where: { id: recordId },
    include: { attendee: true, signature: true, consents: true, event: true },
  });
  if (rec.status !== 'COMPLETED' || !rec.signature || !rec.evidenceHash) throw new Error(`Registro ${recordId} sin firma completa`);
  const [settings, logo, sig] = await Promise.all([getSettings(), loadLogo(), getFile(rec.signature.imagePath)]);
  const ev = rec.event;
  const agreement = rec.consents.find((c) => c.type === 'SIGNATURE_AGREEMENT');
  const data = rec.consents.find((c) => c.type === 'DATA_TREATMENT');
  return renderReceipt({
    companyName: settings.companyName,
    companyNit: settings.companyNit,
    logo,
    participant: {
      fullName: rec.attendee.fullName,
      documentNumber: decrypt(rec.attendee.documentNumberEnc),
      company: rec.attendee.company,
      management: rec.attendee.management,
      area: rec.attendee.area,
      email: rec.attendee.email,
    },
    event: {
      code: ev.code,
      name: ev.name,
      program: ev.program,
      topic: ev.topic,
      relatedDocument: ev.relatedDocument,
      trainer: ev.trainer,
      institution: ev.institution,
      classification: CLASSIFICATION_LABELS[ev.classification],
      dateText: fmtEventDateLong(ev.date),
      schedule: `${ev.startTime} a ${ev.endTime}`,
      durationHours: fmtHours(ev.durationHours),
      location: ev.location,
    },
    record: {
      id: rec.id,
      evidenceCode: rec.evidenceCode,
      registeredAt: `${fmtDateTime(rec.completedAt)} (hora de Colombia)`,
      authMethod: rec.authMethod === 'SMS_OTP' ? 'Código OTP por SMS' : 'Código OTP por correo electrónico',
      authDestination: rec.authDestinationMasked ?? '',
      otpVerifiedAt: fmtDateTime(rec.otpVerifiedAt),
      agreementVersion: agreement?.version ?? '—',
      dataConsentVersion: data?.version ?? null,
      evidenceHash: rec.evidenceHash,
      signatureSha256: rec.signature.imageSha256,
    },
    signaturePng: sig,
    verifyUrl: verifyUrl(rec.evidenceCode),
    generatedAt: fmtDateTime(new Date()),
    footerNote: settings.receiptFooterNote,
  });
}

export async function exportRows(eventId: string): Promise<AttendanceExportRow[]> {
  const recs = await completedRecords(eventId);
  const jobs = await prisma.emailJob.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' } });
  const lastJob = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) if (j.attendanceRecordId && !lastJob.has(j.attendanceRecordId)) lastJob.set(j.attendanceRecordId, j);
  return recs.map((r, i) => ({
    sequence: r.sequence ?? i + 1,
    documentNumber: decrypt(r.attendee.documentNumberEnc),
    fullName: r.attendee.fullName,
    company: r.attendee.company,
    management: r.attendee.management,
    area: r.attendee.area,
    email: r.attendee.email,
    status: ATTENDANCE_STATUS_LABELS[r.status],
    completedAt: fmtDateTime(r.completedAt),
    authMethod: r.authMethod === 'SMS_OTP' ? 'OTP SMS' : 'OTP correo',
    evidenceCode: r.evidenceCode,
    evidenceHash: r.evidenceHash ?? '',
    emailStatus: lastJob.get(r.id) ? EMAIL_STATUS_LABELS[lastJob.get(r.id)!.status] : 'Sin envío',
  }));
}

export async function eventInfo(eventId: string): Promise<Record<string, string>> {
  const ev = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { organizer: true } });
  return {
    Código: ev.code,
    Evento: ev.name,
    'Programa / Tema / Documento': [ev.program, ev.topic, ev.relatedDocument].filter(Boolean).join(' / '),
    Formador: ev.trainer,
    Institución: ev.institution,
    Clasificación: CLASSIFICATION_LABELS[ev.classification],
    Fecha: fmtEventDateLong(ev.date),
    Horario: `${ev.startTime} a ${ev.endTime} (${fmtHours(ev.durationHours)} h)`,
    Lugar: ev.location,
    Organizador: ev.organizer.name,
    Estado: STATUS_LABELS[ev.status],
    'Fecha de cierre': ev.closedAt ? fmtDateTime(ev.closedAt) : '—',
  };
}

export async function buildAttendanceXlsx(eventId: string) {
  return attendanceWorkbook(await eventInfo(eventId), await exportRows(eventId));
}

export async function computeClosingMetrics(eventId: string): Promise<ClosingMetrics> {
  const [registered, signed, sheets, receipts, jobs] = await Promise.all([
    prisma.attendanceRecord.count({ where: { eventId, status: { not: 'VOIDED' } } }),
    prisma.attendanceRecord.count({ where: { eventId, status: 'COMPLETED' } }),
    prisma.document.count({ where: { eventId, type: 'ATTENDANCE_SHEET', isFinal: true } }),
    prisma.document.count({ where: { eventId, type: 'RECEIPT' } }),
    prisma.emailJob.groupBy({ by: ['status'], where: { eventId, isManualResend: false }, _count: true }),
  ]);
  const c = (s: string[]) => jobs.filter((j) => s.includes(j.status)).reduce((a, j) => a + j._count, 0);
  const valid = await prisma.attendanceRecord.count({ where: { eventId, status: 'COMPLETED', signature: { isNot: null }, evidenceHash: { not: null } } });
  return {
    registered,
    signed,
    valid,
    sheets,
    receipts,
    emailsSent: c(['SENT_TO_PROVIDER', 'DELIVERED']),
    emailsDelivered: c(['DELIVERED']),
    emailsPending: c(['PENDING', 'RETRYING']),
    emailsFailed: c(['FAILED', 'REJECTED']),
  };
}

export async function buildClosingReport(eventId: string, format: 'pdf' | 'xlsx') {
  const [info, metrics, rows] = await Promise.all([eventInfo(eventId), computeClosingMetrics(eventId), exportRows(eventId)]);
  if (format === 'xlsx') return closingReportWorkbook(info, metrics, rows);
  const settings = await getSettings();
  return renderClosingReport({ companyName: settings.companyName, logo: await loadLogo(), info, metrics, rows, generatedAt: fmtDateTime(new Date()) });
}

/**
 * Genera y guarda un documento definitivo de forma idempotente:
 * si ya existe un documento con la misma clave, se devuelve el existente sin regenerarlo.
 */
export async function ensureFinalDocument(p: {
  idempotencyKey: string;
  type: DocumentType;
  eventId: string;
  attendanceRecordId?: string | null;
  fileName: string;
  mimeType: string;
  verificationCode?: string;
  generate: (verificationCode: string) => Promise<Buffer>;
}) {
  const existing = await prisma.document.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
  if (existing) {
    if (!(await fileExists(existing.storagePath))) throw new Error(`Archivo del documento ${existing.id} no encontrado en el almacenamiento`);
    return existing;
  }
  const verificationCode = p.verificationCode ?? randomCode(3, 4, 'DOC');
  const buffer = await p.generate(verificationCode);
  const ext = p.fileName.split('.').pop();
  // Ruta única por intento: si dos procesos compiten, el perdedor no sobrescribe el archivo del ganador.
  const stored = await putFile(
    `documents/${p.eventId}/${p.type.toLowerCase()}/${p.idempotencyKey.replace(/[^\w-]/g, '_')}-${randomToken(6)}.${ext}`,
    buffer,
  );
  try {
    return await prisma.document.create({
      data: {
        type: p.type,
        eventId: p.eventId,
        attendanceRecordId: p.attendanceRecordId ?? null,
        verificationCode,
        idempotencyKey: p.idempotencyKey,
        storagePath: stored.path,
        fileName: p.fileName,
        mimeType: p.mimeType,
        sizeBytes: stored.size,
        sha256: stored.sha256,
        isFinal: true,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return prisma.document.findUniqueOrThrow({ where: { idempotencyKey: p.idempotencyKey } });
    }
    throw e;
  }
}

export const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
