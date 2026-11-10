import { prisma } from '@/lib/db';
import { canonicalJson, sha256 } from '@/lib/crypto';
import { fmtDateTime, fmtEventDateLong, maskName } from '@/lib/format';
import { getFile } from '@/lib/storage';

const DOC_TYPE_LABELS: Record<string, string> = {
  ATTENDANCE_SHEET: 'Planilla oficial de asistencia',
  ATTENDANCE_XLSX: 'Exportación de asistencia (Excel)',
  RECEIPT: 'Comprobante individual de asistencia',
  CLOSING_REPORT_PDF: 'Informe de cierre (PDF)',
  CLOSING_REPORT_XLSX: 'Informe de cierre (Excel)',
};

async function fileIntegrity(path: string, expected: string) {
  try {
    return sha256(await getFile(path)) === expected;
  } catch {
    return false;
  }
}

/**
 * Consulta pública de verificación. Solo expone datos mínimos (nombre enmascarado,
 * evento, fechas y huellas); nunca identificación, correo ni teléfono.
 */
export async function verifyCode(rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { found: false as const };

  const rec = await prisma.attendanceRecord.findUnique({
    where: { evidenceCode: code },
    include: { attendee: true, event: true, signature: true, documents: { where: { type: 'RECEIPT' } } },
  });
  if (rec && (rec.status === 'COMPLETED' || rec.status === 'VOIDED')) {
    const evidenceOk = Boolean(rec.evidenceJson && rec.evidenceHash && sha256(canonicalJson(rec.evidenceJson)) === rec.evidenceHash);
    const signatureOk = rec.signature ? await fileIntegrity(rec.signature.imagePath, rec.signature.imageSha256) : false;
    const receipt = rec.documents[0];
    const receiptOk = receipt ? await fileIntegrity(receipt.storagePath, receipt.sha256) : null;
    return {
      found: true as const,
      kind: 'ATTENDANCE' as const,
      code,
      typeLabel: 'Registro electrónico de asistencia',
      status: rec.status === 'VOIDED' ? 'ANULADO' : 'VIGENTE',
      voidReason: rec.status === 'VOIDED' ? 'Registro anulado por la organización' : null,
      recordId: rec.id,
      participant: maskName(rec.attendee.fullName),
      event: { name: rec.event.name, code: rec.event.code, date: fmtEventDateLong(rec.event.date) },
      signedAt: fmtDateTime(rec.completedAt),
      authMethod: rec.authMethod === 'SMS_OTP' ? 'OTP por SMS' : 'OTP por correo electrónico',
      evidenceHash: rec.evidenceHash,
      document: receipt ? { typeLabel: DOC_TYPE_LABELS.RECEIPT, sha256: receipt.sha256, createdAt: fmtDateTime(receipt.createdAt) } : null,
      integrity: { evidence: evidenceOk, signature: signatureOk, document: receiptOk },
    };
  }

  const doc = await prisma.document.findUnique({ where: { verificationCode: code }, include: { event: true } });
  if (doc) {
    return {
      found: true as const,
      kind: 'DOCUMENT' as const,
      code,
      typeLabel: DOC_TYPE_LABELS[doc.type] ?? doc.type,
      status: 'VIGENTE',
      voidReason: null,
      recordId: doc.id,
      participant: null,
      event: { name: doc.event.name, code: doc.event.code, date: fmtEventDateLong(doc.event.date) },
      signedAt: null,
      authMethod: null,
      evidenceHash: null,
      document: { typeLabel: DOC_TYPE_LABELS[doc.type] ?? doc.type, sha256: doc.sha256, createdAt: fmtDateTime(doc.createdAt) },
      integrity: { evidence: null, signature: null, document: await fileIntegrity(doc.storagePath, doc.sha256) },
    };
  }
  return { found: false as const };
}

/** Compara la huella SHA-256 de un archivo (calculada en el navegador) con el expediente conservado. */
export async function compareDocumentHash(rawCode: string, hash: string) {
  const code = rawCode.trim().toUpperCase();
  const h = hash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(h)) return { match: false, reason: 'Huella inválida' };
  const doc =
    (await prisma.document.findUnique({ where: { verificationCode: code } })) ??
    (await prisma.document.findFirst({ where: { type: 'RECEIPT', attendanceRecord: { evidenceCode: code } } }));
  if (!doc) return { match: false, reason: 'No existe un documento conservado para este código' };
  return {
    match: doc.sha256 === h,
    reason: doc.sha256 === h ? 'El archivo es idéntico al documento conservado en el expediente.' : 'El archivo NO corresponde al documento conservado (fue modificado o es otro documento).',
  };
}
