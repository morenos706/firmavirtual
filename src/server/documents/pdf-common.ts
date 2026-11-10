import path from 'node:path';
import PDFDocument from 'pdfkit';

export const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
export const F = {
  regular: 'Arial',
  bold: 'Arial-Bold',
  italic: 'Arial-Italic',
};

/** 1 twip = 1/20 pt. Utilidad para traducir medidas del documento Word de referencia. */
export const tw = (twips: number) => twips / 20;

/**
 * Crea un documento PDF tamaño carta con la fuente Liberation Sans
 * (métricamente equivalente a Arial, la fuente del formato institucional).
 */
export function createLetterDoc(info: { Title: string; Subject?: string; Author?: string }) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
    info: { ...info, Creator: 'FirmaQR', Producer: 'FirmaQR' },
    pdfVersion: '1.7',
  });
  doc.registerFont(F.regular, path.join(FONT_DIR, 'LiberationSans-Regular.ttf'));
  doc.registerFont(F.bold, path.join(FONT_DIR, 'LiberationSans-Bold.ttf'));
  doc.registerFont(F.italic, path.join(FONT_DIR, 'LiberationSans-Italic.ttf'));
  return doc;
}

export function renderToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Dibuja el logo ajustado a la caja (o el nombre de la empresa si no hay logo configurado). */
export function drawLogo(
  doc: PDFKit.PDFDocument,
  logo: Buffer | null | undefined,
  companyName: string,
  box: { x: number; y: number; w: number; h: number },
  color = '#40637D',
) {
  if (logo) {
    try {
      doc.image(logo, box.x, box.y, { fit: [box.w, box.h], valign: 'center' });
      return;
    } catch {
      /* logo inválido → texto */
    }
  }
  let size = 13;
  doc.font(F.bold);
  while (size > 7 && doc.fontSize(size).widthOfString(companyName) > box.w) size -= 0.5;
  doc.fillColor(color).fontSize(size).text(companyName, box.x, box.y + (box.h - size) / 2, { width: box.w, lineBreak: false });
  doc.fillColor('black');
}

/** Ajusta el tamaño de letra para que el texto quepa en `lines` líneas del ancho dado (sin truncar). */
export function fitFontSize(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  width: number,
  maxSize: number,
  minSize: number,
  maxHeight: number,
) {
  let size = maxSize;
  doc.font(font);
  while (size > minSize) {
    doc.fontSize(size);
    if (doc.heightOfString(text, { width, lineGap: 0 }) <= maxHeight) return size;
    size -= 0.25;
  }
  return minSize;
}
