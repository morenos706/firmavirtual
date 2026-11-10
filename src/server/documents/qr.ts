import QRCode from 'qrcode';
import { F, createLetterDoc, drawLogo, renderToBuffer } from './pdf-common';
import { BRAND, drawColorBar } from '@/lib/brand';

export async function qrPng(url: string, width = 800): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width, color: { dark: '#2C4659', light: '#FFFFFF' } });
}

/** Cartel imprimible del QR del evento (tamaño carta). */
export async function qrPosterPdf(p: {
  url: string;
  eventName: string;
  eventCode: string;
  dateText: string;
  location: string;
  companyName: string;
  logo?: Buffer | null;
}): Promise<Buffer> {
  const doc = createLetterDoc({ Title: `QR ${p.eventCode}`, Author: p.companyName });
  doc.addPage({ size: 'LETTER', margin: 0 });
  const W = 612;
  drawColorBar(doc, 0, 0, W, 8);
  drawLogo(doc, p.logo, p.companyName, { x: 50, y: 34, w: 150, h: 40 });
  doc.font(F.bold).fontSize(12).fillColor(BRAND.gris).text('Firma', 470, 48, { continued: true }).fillColor(BRAND.azul).text('QR');
  doc.font(F.bold).fontSize(26).fillColor(BRAND.azul).text('Registro de asistencia', 50, 110, { width: W - 100, align: 'center' });
  doc.font(F.regular).fontSize(16).fillColor(BRAND.gris).text(p.eventName, 60, 148, { width: W - 120, align: 'center' });
  const yInfo = doc.y + 6;
  doc.font(F.regular).fontSize(11).fillColor(BRAND.gris).text(`${p.dateText} · ${p.location}`, 60, yInfo, { width: W - 120, align: 'center' });
  const png = await qrPng(p.url, 900);
  const size = 330;
  const qy = Math.max(doc.y + 24, 230);
  doc.roundedRect((W - size) / 2 - 14, qy - 14, size + 28, size + 28, 12).lineWidth(2).strokeColor(BRAND.azul).stroke();
  doc.image(png, (W - size) / 2, qy, { width: size });
  const ty = qy + size + 34;
  doc.font(F.bold).fontSize(14).fillColor(BRAND.azul).text('Escanee el código con la cámara de su celular', 50, ty, { width: W - 100, align: 'center' });
  doc.font(F.regular).fontSize(11).fillColor(BRAND.gris).text(
    'Diligencie sus datos, verifique su identidad con el código que recibirá y firme en la pantalla. No necesita instalar aplicaciones.',
    90, doc.y + 6, { width: W - 180, align: 'center' },
  );
  doc.font(F.regular).fontSize(8).fillColor('#7a8a96').text(p.url, 50, 735, { width: W - 100, align: 'center' });
  doc.text(`Evento ${p.eventCode}`, 50, 748, { width: W - 100, align: 'center' });
  drawColorBar(doc, 0, 784, W, 8);
  return renderToBuffer(doc);
}
