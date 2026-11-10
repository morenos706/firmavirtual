import { F, createLetterDoc, drawLogo, renderToBuffer } from './pdf-common';
import { BRAND, drawColorBar } from '@/lib/brand';
import { METRIC_LABELS, type AttendanceExportRow, type ClosingMetrics } from './excel';

const NAVY = BRAND.azul;
const GREEN = BRAND.sec3;
const MUTED = BRAND.gris;

export async function renderClosingReport(p: {
  companyName: string;
  logo?: Buffer | null;
  info: Record<string, string>;
  metrics: ClosingMetrics;
  rows: AttendanceExportRow[];
  generatedAt: string;
}): Promise<Buffer> {
  const doc = createLetterDoc({ Title: `Informe de cierre - ${p.info['Código'] ?? ''}`, Author: p.companyName });
  const L = 48;
  const W = 612 - 96;
  const newPage = () => {
    doc.addPage({ size: 'LETTER', margin: 0 });
    drawColorBar(doc, 0, 0, 612, 6);
    drawLogo(doc, p.logo, p.companyName, { x: L, y: 22, w: 120, h: 30 });
    doc.font(F.bold).fontSize(13).fillColor(NAVY).text('INFORME DE CIERRE DE EVENTO', L, 30, { width: W, align: 'right' });
    doc.font(F.regular).fontSize(8).fillColor(MUTED).text(`Generado: ${p.generatedAt} · FirmaQR`, L, 47, { width: W, align: 'right' });
    return 72;
  };
  let y = newPage();
  for (const [k, v] of Object.entries(p.info)) {
    doc.font(F.bold).fontSize(8.5).fillColor(GREEN).text(k, L, y, { width: 130 });
    doc.font(F.regular).fontSize(9).fillColor(NAVY).text(v, L + 135, y, { width: W - 135 });
    y = Math.max(doc.y, y + 11) + 3;
  }
  y += 8;
  doc.rect(L, y, W, 18).fill(NAVY);
  doc.font(F.bold).fontSize(9).fillColor('#FFFFFF').text('Indicador', L + 8, y + 5).text('Valor', L, y + 5, { width: W - 8, align: 'right' });
  y += 18;
  METRIC_LABELS.forEach(([k, label], i) => {
    if (i % 2 === 0) doc.rect(L, y, W, 18).fill('#F4F2EF');
    doc.font(F.regular).fontSize(9).fillColor(NAVY).text(label, L + 8, y + 5);
    doc.font(F.bold).text(String(p.metrics[k]), L, y + 5, { width: W - 8, align: 'right' });
    y += 18;
  });
  y += 18;
  doc.font(F.bold).fontSize(10).fillColor(GREEN).text('DETALLE DE ASISTENCIAS Y COMPROBANTES', L, y);
  y = doc.y + 6;
  const cols: [string, number, (r: AttendanceExportRow) => string][] = [
    ['#', 22, (r) => String(r.sequence ?? '')],
    ['Cédula', 70, (r) => r.documentNumber],
    ['Nombre y apellidos', 150, (r) => r.fullName],
    ['Firma', 88, (r) => r.completedAt],
    ['Evidencia', 96, (r) => r.evidenceCode],
    ['Comprobante', 90, (r) => r.emailStatus ?? ''],
  ];
  const header = () => {
    doc.rect(L, y, W, 15).fill(NAVY);
    let x = L;
    for (const [h, w] of cols) {
      doc.font(F.bold).fontSize(7.5).fillColor('#FFFFFF').text(h, x + 3, y + 4, { width: w - 6, lineBreak: false });
      x += w;
    }
    y += 15;
  };
  header();
  for (const r of p.rows) {
    doc.font(F.regular).fontSize(7.5);
    const h = Math.max(...cols.map(([, w, f]) => doc.heightOfString(f(r) || ' ', { width: w - 6 }))) + 6;
    if (y + h > 750) {
      y = newPage();
      header();
    }
    let x = L;
    for (const [, w, f] of cols) {
      doc.fillColor(NAVY).text(f(r), x + 3, y + 3, { width: w - 6 });
      x += w;
    }
    doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.3).strokeColor('#c9d3d0').stroke();
    y += h;
  }
  if (p.rows.length === 0) doc.font(F.italic).fontSize(8.5).fillColor(MUTED).text('El evento no tiene asistencias firmadas.', L, y + 6);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font(F.regular).fontSize(7.5).fillColor(MUTED).text(`Página ${i + 1} de ${range.count}`, L, 765, { width: W, align: 'right', lineBreak: false });
  }
  return renderToBuffer(doc);
}
