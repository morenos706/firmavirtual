import { F, createLetterDoc, drawLogo, renderToBuffer } from './pdf-common';
import { qrPng } from './qr';
import { BRAND, drawColorBar } from '@/lib/brand';

export type ReceiptData = {
  companyName: string;
  companyNit?: string | null;
  logo?: Buffer | null;
  participant: { fullName: string; documentNumber: string; company: string | null; management: string | null; area: string | null; email: string };
  event: {
    code: string;
    name: string;
    program: string;
    topic: string;
    relatedDocument: string | null;
    trainer: string;
    institution: string;
    classification: string;
    dateText: string;
    schedule: string;
    durationHours: string;
    location: string;
  };
  record: {
    id: string;
    evidenceCode: string;
    registeredAt: string; // fecha y hora de registro (Colombia)
    authMethod: string;
    authDestination: string;
    otpVerifiedAt: string;
    agreementVersion: string;
    dataConsentVersion: string | null;
    evidenceHash: string;
    signatureSha256: string;
  };
  signaturePng: Buffer;
  verifyUrl: string;
  generatedAt: string;
  footerNote?: string | null;
};

const NAVY = BRAND.azul;
const GREEN = BRAND.azul;
const MUTED = BRAND.gris;
const LINE = '#D5DEE6';

/** Comprobante individual de asistencia (PDF, carta, una página). */
export async function renderReceipt(d: ReceiptData): Promise<Buffer> {
  const doc = createLetterDoc({ Title: `Comprobante de asistencia - ${d.record.evidenceCode}`, Subject: d.event.name, Author: d.companyName });
  doc.addPage({ size: 'LETTER', margin: 0 });
  const L = 48;
  const R = 612 - 48;
  const W = R - L;

  // Encabezado
  drawColorBar(doc, 0, 0, 612, 6);
  drawLogo(doc, d.logo, d.companyName, { x: L, y: 26, w: 140, h: 38 });
  doc.font(F.bold).fontSize(10).fillColor(NAVY).text(d.companyName, L + 160, 30, { width: W - 160, align: 'right' });
  if (d.companyNit) doc.font(F.regular).fontSize(8.5).fillColor(MUTED).text(`NIT ${d.companyNit}`, L + 160, doc.y + 1, { width: W - 160, align: 'right' });
  doc.font(F.regular).fontSize(8.5).fillColor(MUTED).text('Plataforma FirmaQR', L + 160, doc.y + 1, { width: W - 160, align: 'right' });

  doc.rect(L, 78, W, 40).fill(NAVY);
  doc.font(F.bold).fontSize(17).fillColor('#FFFFFF').text('COMPROBANTE DE ASISTENCIA', L + 16, 90, { lineBreak: false });
  doc.font(F.regular).fontSize(8.5).fillColor(BRAND.blanco).text(`No. ${d.record.evidenceCode}`, L, 95, { width: W - 16, align: 'right' });

  let y = 134;
  const section = (title: string) => {
    doc.font(F.bold).fontSize(9.5).fillColor(GREEN).text(title.toUpperCase(), L, y, { characterSpacing: 0.6 });
    y = doc.y + 3;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(GREEN).stroke();
    y += 7;
  };
  const grid = (items: [string, string][], cols = 2) => {
    const colW = W / cols;
    for (let i = 0; i < items.length; i += cols) {
      let rowH = 0;
      for (let c = 0; c < cols && i + c < items.length; c++) {
        const [k, v] = items[i + c];
        const x = L + c * colW;
        doc.font(F.regular).fontSize(7.5).fillColor(MUTED).text(k, x, y, { width: colW - 12 });
        const vy = doc.y + 1;
        doc.font(F.bold).fontSize(9.5).fillColor(NAVY).text(v || '—', x, vy, { width: colW - 12 });
        rowH = Math.max(rowH, doc.y - y);
      }
      y += rowH + 7;
    }
  };

  section('Datos del participante');
  grid([
    ['Nombre completo', d.participant.fullName],
    ['Identificación', d.participant.documentNumber],
    ['Empresa', d.participant.company ?? '—'],
    ['Gerencia', d.participant.management ?? '—'],
    ['Área', d.participant.area ?? '—'],
    ['Correo electrónico', d.participant.email],
  ]);

  y += 2;
  section('Datos del evento');
  grid([
    ['Programa / Tema', [d.event.program, d.event.topic].join(' / ')],
    ['Evento', d.event.name],
    ['Formador', d.event.trainer],
    ['Institución', `${d.event.institution} (${d.event.classification})`],
    ['Fecha', d.event.dateText],
    ['Horario / Duración', `${d.event.schedule} · ${d.event.durationHours} h`],
    ['Lugar', d.event.location],
    ['Documento relacionado', d.event.relatedDocument ?? '—'],
  ]);

  y += 2;
  section('Registro y firma electrónica');
  const top = y;
  const leftW = W * 0.6;
  // Firma manuscrita
  doc.font(F.regular).fontSize(7.5).fillColor(MUTED).text('Firma manuscrita electrónica', L, y);
  const boxY = doc.y + 3;
  const boxH = 92;
  doc.roundedRect(L, boxY, leftW - 12, boxH, 4).lineWidth(0.7).strokeColor(LINE).stroke();
  doc.image(d.signaturePng, L + 8, boxY + 6, { fit: [leftW - 28, boxH - 20], align: 'center', valign: 'center' });
  doc.moveTo(L + 20, boxY + boxH - 14).lineTo(L + leftW - 32, boxY + boxH - 14).lineWidth(0.5).strokeColor('#9aa7b0').stroke();
  doc.font(F.regular).fontSize(7).fillColor(MUTED).text(d.participant.fullName, L, boxY + boxH - 11, { width: leftW - 12, align: 'center' });
  y = boxY + boxH + 8;
  const kv = (k: string, v: string, mono = false) => {
    doc.font(F.regular).fontSize(7.5).fillColor(MUTED).text(k, L, y, { width: leftW - 12 });
    doc.font(mono ? F.regular : F.bold).fontSize(mono ? 7.5 : 9).fillColor(NAVY).text(v, L, doc.y + 1, { width: leftW - 12 });
    y = doc.y + 5;
  };
  kv('Fecha y hora de registro', d.record.registeredAt);
  kv('Método de autenticación', `${d.record.authMethod} · ${d.record.authDestination} · verificado ${d.record.otpVerifiedAt}`);
  kv('Manifestación de voluntad', `Acuerdo de firma electrónica v${d.record.agreementVersion}` + (d.record.dataConsentVersion ? ` · Autorización de tratamiento de datos v${d.record.dataConsentVersion}` : ''));
  kv('Identificador único del registro', `${d.record.evidenceCode} · ${d.record.id}`, true);
  kv('Huella criptográfica SHA-256 del expediente de evidencia', d.record.evidenceHash, true);
  kv('SHA-256 de la imagen de la firma', d.record.signatureSha256, true);

  // QR de verificación
  const qx = L + leftW + 8;
  const qw = W - leftW - 8;
  doc.roundedRect(qx, top, qw, 214, 6).fill('#F4F2EF');
  doc.font(F.bold).fontSize(9).fillColor(NAVY).text('Verificación del documento', qx + 10, top + 12, { width: qw - 20, align: 'center' });
  const qrSize = Math.min(140, qw - 40);
  doc.image(await qrPng(d.verifyUrl, 500), qx + (qw - qrSize) / 2, top + 30, { width: qrSize });
  doc.font(F.regular).fontSize(7).fillColor(MUTED).text('Escanee el código o ingrese a:', qx + 10, top + 34 + qrSize, { width: qw - 20, align: 'center' });
  doc.font(F.regular).fontSize(6.8).fillColor(BRAND.sec1).text(d.verifyUrl, qx + 10, doc.y + 1, { width: qw - 20, align: 'center' });
  y = Math.max(y, top + 220) + 4;

  // Nota legal
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.font(F.regular).fontSize(6.6).fillColor(MUTED).text(
    'Este comprobante deja constancia del registro electrónico de asistencia realizado mediante la plataforma FirmaQR, con autenticación por código de un solo uso (OTP), ' +
      'aceptación expresa del acuerdo de firma electrónica y trazo manuscrito del participante (Ley 527 de 1999 y Decreto 2364 de 2012, compilado en el Decreto 1074 de 2015). ' +
      'La huella SHA-256 permite comprobar la integridad del expediente conservado; no corresponde a una firma digital certificada. ' +
      'Los datos personales se tratan conforme a la Ley 1581 de 2012. ' +
      (d.footerNote ? d.footerNote + ' ' : '') +
      `Documento generado el ${d.generatedAt}. Evento ${d.event.code}.`,
    L, y + 6, { width: W, align: 'justify', lineGap: 0.5 },
  );
  drawColorBar(doc, 0, 786, 612, 6);
  return renderToBuffer(doc);
}
