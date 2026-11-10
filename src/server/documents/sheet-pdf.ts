/**
 * PLANILLA OFICIAL DE ASISTENCIA
 * Reproducción del formato institucional 11020001F-01 V0.6 "FORMATO PARA EL REGISTRO DE ASISTENCIA".
 *
 * Todas las medidas provienen del documento Word de referencia (en twips, 1/20 pt):
 *  - Página carta 12240 x 15840; márgenes izq. 1418, der. 851, sup./inf. 737; encabezado/pie a 510.
 *  - Tabla de información: ancho 10512, sangría -459, filas 454/363/454/454, Arial 11 pt.
 *  - Tabla de asistentes: columnas 426 | 1560 | 4110 | 1560 | 1559 | 1843 (# | Cédula | Nombre y Apellidos |
 *    Empresa | Gerencia | Área), sangría -923, encabezado con relleno negro y texto blanco en negrita 10.5 pt,
 *    filas de alto mínimo 397.
 *  - Página 1: encabezado institucional + título + información + filas 1-25.
 *  - Páginas siguientes: encabezado institucional + filas 26-57 (32 filas por página).
 *  - Pie de página: código y versión del formato, alineado a la derecha.
 *
 * Ajuste solicitado por la empresa: columna adicional "Firma" a la derecha con la imagen de la firma
 * manuscrita de cada asistente (configurable en Configuración → Formato). Se mantiene el ancho total de
 * la tabla, el orden de las columnas originales, el alto de fila y la distribución de 25/32 filas.
 */
import { F, createLetterDoc, drawLogo, fitFontSize, renderToBuffer, tw } from './pdf-common';

export type SheetRow = {
  sequence: number;
  documentNumber: string;
  fullName: string;
  company: string | null;
  management: string | null;
  area: string | null;
  evidenceCode: string;
  /** PNG de la firma manuscrita (columna "Firma"). */
  signature?: Buffer | null;
};

export type SheetData = {
  companyName: string;
  logo?: Buffer | null;
  formatCode: string;
  formatVersion: string;
  title: string;
  event: {
    code: string;
    program: string;
    topic: string;
    relatedDocument: string | null;
    trainer: string;
    institution: string;
    classification: 'INTERNAL' | 'EXTERNAL';
    dateShort: string; // DD/MM/AA
    startTime: string;
    endTime: string;
    durationHours: string;
  };
  rows: SheetRow[];
  verificationCode: string;
  verifyUrl: string;
  draft?: boolean;
  generatedAt: string;
  /** Agrega la columna "Firma" con la imagen de la firma manuscrita de cada asistente (por defecto: sí). */
  showSignature?: boolean;
};

// ── Geometría (pt) ───────────────────────────────────────────────────────────
export const PAGE = { w: tw(12240), h: tw(15840) };
const MARGIN = { left: tw(1418), right: tw(851), top: tw(737), bottom: tw(737), header: tw(510), footer: tw(510) };
const CONTENT_RIGHT = PAGE.w - MARGIN.right;
const INFO = { x: MARGIN.left + tw(-459), w: tw(10512), rows: [tw(454), tw(363), tw(454), tw(454)], pad: tw(108) };
/** Columnas originales del formato: # | Cédula | Nombre y Apellidos | Empresa | Gerencia | Área. */
export const COLS_ORIGINAL = [tw(426), tw(1560), tw(4110), tw(1560), tw(1559), tw(1843)];
/**
 * Variante con columna "Firma": se conserva el ancho total de la tabla del formato (11058 twips) y el
 * orden de las columnas originales; el espacio de la firma se toma proporcionalmente de las demás.
 */
export const COLS_WITH_SIGNATURE = [tw(426), tw(1320), tw(3300), tw(1320), tw(1320), tw(1440), tw(1932)];
const HEADERS_ORIGINAL = ['#', 'Cédula', 'Nombre y Apellidos', 'Empresa', 'Gerencia', 'Área'];
// Geometría activa (se fija al inicio de cada renderizado, que es sincrónico).
export let COLS = COLS_ORIGINAL;
let HEADERS = HEADERS_ORIGINAL;
let SHOW_SIGNATURE = false;
function setLayout(showSignature: boolean) {
  SHOW_SIGNATURE = showSignature;
  COLS = showSignature ? COLS_WITH_SIGNATURE : COLS_ORIGINAL;
  HEADERS = showSignature ? [...HEADERS_ORIGINAL, 'Firma'] : HEADERS_ORIGINAL;
}
const TABLE_X = MARGIN.left + tw(-923);
const TABLE_W = COLS_ORIGINAL.reduce((a, b) => a + b, 0);
const HEADER_ROW_H = 14.5;
export const MIN_ROW_H = tw(397);
const TABLE_TOP_FIRST = 186;
const TABLE_TOP_NEXT = 77;
const TABLE_BOTTOM_LIMIT = 727.5;
export const ROWS_FIRST_PAGE = 25;
export const ROWS_NEXT_PAGES = 32;
const CELL_PAD_X = 2.6;
const DATA_FONT = 7.5;
const MIN_FONT = 5.5;
const CODE_FONT = 5;

type MeasuredRow = { row: SheetRow | null; number: number; height: number; sizes?: number[] };
export type SheetPage = { rows: MeasuredRow[]; tableTop: number };

/**
 * Mide una fila. Cada celda usa 7.5 pt y, si el texto no cabe en el alto estándar del formato,
 * reduce la letra hasta 5.5 pt; si aún así no cabe, la fila crece (nunca se trunca el texto).
 */
function measureRow(doc: PDFKit.PDFDocument, r: SheetRow): { height: number; sizes: number[] } {
  const w = (i: number) => COLS[i] - CELL_PAD_X * 2;
  const inner = MIN_ROW_H - 4;
  const codeText = `Firma electrónica · Exp. ${r.evidenceCode}`;
  doc.font(F.regular);
  const codeH = doc.fontSize(CODE_FONT).heightOfString(codeText, { width: w(2) }) + 0.5;
  const sizes = [
    0,
    fitFontSize(doc, r.documentNumber, F.regular, w(1), DATA_FONT, MIN_FONT, inner),
    fitFontSize(doc, r.fullName, F.regular, w(2), DATA_FONT, MIN_FONT, inner - codeH),
    fitFontSize(doc, r.company ?? '', F.regular, w(3), DATA_FONT, MIN_FONT, inner),
    fitFontSize(doc, r.management ?? '', F.regular, w(4), DATA_FONT, MIN_FONT, inner),
    fitFontSize(doc, r.area ?? '', F.regular, w(5), DATA_FONT, MIN_FONT, inner),
  ];
  const texts = ['', r.documentNumber, r.fullName, r.company ?? '', r.management ?? '', r.area ?? ''];
  doc.font(F.regular);
  const hs = texts.map((t, i) => (i === 0 ? 0 : doc.fontSize(sizes[i]).heightOfString(t || ' ', { width: w(i) }) + (i === 2 ? codeH : 0)));
  return { height: Math.max(MIN_ROW_H, Math.max(...hs) + 4), sizes };
}

/**
 * Distribuye las filas en páginas respetando el formato (25 filas en la primera página y 32 en las
 * siguientes), sin partir filas entre páginas y completando la última página con filas vacías anuladas.
 */
export function paginate(doc: PDFKit.PDFDocument, rows: SheetRow[], fillBlankRows = true): SheetPage[] {
  const pages: SheetPage[] = [];
  let current: SheetPage = { rows: [], tableTop: TABLE_TOP_FIRST };
  let y = current.tableTop + HEADER_ROW_H;
  const capacity = () => (pages.length === 0 ? ROWS_FIRST_PAGE : ROWS_NEXT_PAGES);
  const newPage = () => {
    pages.push(current);
    current = { rows: [], tableTop: TABLE_TOP_NEXT };
    y = current.tableTop + HEADER_ROW_H;
  };
  let n = 0;
  for (const r of rows) {
    const { height: h, sizes } = measureRow(doc, r);
    if (current.rows.length >= capacity() || y + h > TABLE_BOTTOM_LIMIT + 0.01) newPage();
    n++;
    current.rows.push({ row: r, number: r.sequence ?? n, height: h, sizes });
    y += h;
  }
  if (fillBlankRows) {
    let next = (current.rows.at(-1)?.number ?? n) + 1;
    while (current.rows.length < capacity() && y + MIN_ROW_H <= TABLE_BOTTOM_LIMIT + 0.01) {
      current.rows.push({ row: null, number: next++, height: MIN_ROW_H });
      y += MIN_ROW_H;
    }
  }
  pages.push(current);
  return pages;
}

function drawHeader(doc: PDFKit.PDFDocument, d: SheetData, pageNo: number, total: number) {
  // Logo institucional (configurable) — caja equivalente a la imagen del encabezado original (1314450 x 304800 EMU).
  drawLogo(doc, d.logo, d.companyName, { x: MARGIN.left, y: MARGIN.header, w: 103.5, h: 24 });
  // "Página X de Y" — Arial 9 pt con los números en 11 pt, alineado al margen derecho.
  const parts: [string, number][] = [
    ['Página ', 9],
    [String(pageNo), 11],
    [' de ', 9],
    [String(total), 11],
  ];
  doc.font(F.regular);
  const width = parts.reduce((s, [t, sz]) => s + doc.fontSize(sz).widthOfString(t), 0);
  let x = CONTENT_RIGHT - width;
  const base = MARGIN.header + 14;
  for (const [t, sz] of parts) {
    doc.fontSize(sz).fillColor('black').text(t, x, base - sz * 0.8, { lineBreak: false });
    x += doc.widthOfString(t);
  }
}

function drawFooter(doc: PDFKit.PDFDocument, d: SheetData) {
  const y = PAGE.h - MARGIN.footer - 11;
  // Referencia a la evidencia electrónica (sin alterar las columnas del formato).
  doc.font(F.regular).fontSize(5.6).fillColor('#444444');
  const note =
    `Planilla generada electrónicamente por FirmaQR · Evento ${d.event.code} · Código de verificación ${d.verificationCode} · ` +
    `Cada asistente cuenta con un registro electrónico de asistencia y firma manuscrita electrónica` +
    (d.showSignature ?? true ? ' (columna "Firma")' : '') +
    `, conservados en su expediente digital (código "Exp." bajo el nombre), con autenticación OTP y huella SHA-256. Verificación: ${d.verifyUrl}` +
    (d.draft ? ' · VISTA PREVIA — NO ES LA VERSIÓN DEFINITIVA.' : ` · Generada: ${d.generatedAt}`);
  doc.text(note, TABLE_X, TABLE_BOTTOM_LIMIT + 3, { width: TABLE_W * 0.78, lineGap: 0.3 });
  const label = `${d.formatCode} ${d.formatVersion}`;
  doc.font(F.regular).fontSize(9).fillColor('black');
  doc.text(label, CONTENT_RIGHT - doc.widthOfString(label), y, { lineBreak: false });
}

function underline(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number) {
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(0.5).strokeColor('black').stroke();
}

function fieldValue(doc: PDFKit.PDFDocument, text: string, x1: number, x2: number, baseline: number, maxSize = 9.5, rowH = 20) {
  const w = x2 - x1 - 2;
  const size = fitFontSize(doc, text, F.regular, w, maxSize, 5, rowH - 3);
  doc.font(F.regular).fontSize(size).fillColor('#000000');
  const h = doc.heightOfString(text, { width: w });
  doc.text(text, x1 + 1, baseline - h - 0.5, { width: w });
}

function drawTitleAndInfo(doc: PDFKit.PDFDocument, d: SheetData) {
  doc.font(F.bold).fontSize(11).fillColor('black');
  const center = MARGIN.left + (CONTENT_RIGHT - MARGIN.left) / 2;
  doc.text(d.title, center - doc.widthOfString(d.title) / 2, 66, { lineBreak: false });

  const x0 = INFO.x + INFO.pad;
  const xEnd = INFO.x + INFO.w - INFO.pad;
  let top = 82;
  const [h1, h2, h3, h4] = INFO.rows;
  const label = (t: string, x: number, rowTop: number, rowH: number) => {
    doc.font(F.regular).fontSize(11).fillColor('black').text(t, x, rowTop + rowH - 15, { lineBreak: false });
    return x + doc.widthOfString(t);
  };

  // Fila 1-2: Programa / Tema / Documento (con línea de continuación)
  const ptd = [d.event.program, d.event.topic, d.event.relatedDocument].filter(Boolean).join(' / ');
  const lEnd = label('Programa / Tema / Documento:', x0, top, h1);
  const line1Start = lEnd + 12;
  const line1Base = top + h1 - 2;
  const line2Base = top + h1 + h2 - 1;
  underline(doc, line1Start, xEnd, line1Base);
  underline(doc, x0 - INFO.pad + 5, xEnd, line2Base);
  // Reparte el texto en las dos líneas del formato, reduciendo la letra si es necesario (nunca se trunca).
  const line1W = xEnd - line1Start - 2;
  const line2W = xEnd - (x0 - INFO.pad + 6);
  let size = 9.5;
  let split: [string, string] = ['', ptd];
  for (; size >= 5; size -= 0.25) {
    doc.font(F.regular).fontSize(size);
    const words = ptd.split(/\s+/);
    let l1 = '';
    let i = 0;
    while (i < words.length && doc.widthOfString((l1 ? l1 + ' ' : '') + words[i]) <= line1W) {
      l1 = (l1 ? l1 + ' ' : '') + words[i];
      i++;
    }
    split = [l1, words.slice(i).join(' ')];
    if (doc.widthOfString(split[1]) <= line2W) break;
  }
  size = Math.max(size, 5);
  doc.font(F.regular).fontSize(size).fillColor('black');
  if (split[0]) doc.text(split[0], line1Start + 1, line1Base - size - 0.5, { lineBreak: false });
  if (split[1]) doc.text(split[1], x0 - INFO.pad + 6, line2Base - size - 0.5, { width: line2W });
  top += h1 + h2;

  // Fila 3: Formador / Institución / Interno / Externo
  const r3Base = top + h3 - 2;
  let x = label('Formador:', x0, top, h3);
  const fStart = x + 6;
  const fEnd = 245;
  underline(doc, fStart, fEnd, r3Base);
  fieldValue(doc, d.event.trainer, fStart, fEnd, r3Base, 9.5, h3);
  x = label('Institución:', 253, top, h3);
  const iStart = x + 8;
  const iEnd = 409;
  underline(doc, iStart, iEnd, r3Base);
  fieldValue(doc, d.event.institution, iStart, iEnd, r3Base, 9.5, h3);
  x = label('Interno:', 416, top, h3);
  const intStart = 475;
  underline(doc, intStart, intStart + 10, r3Base);
  x = label('Externo:', 493, top, h3);
  const extStart = 551;
  underline(doc, extStart, extStart + 11, r3Base);
  doc.font(F.bold).fontSize(10);
  if (d.event.classification === 'INTERNAL') doc.text('X', intStart + 1.5, r3Base - 10.5, { lineBreak: false });
  else doc.text('X', extStart + 2, r3Base - 10.5, { lineBreak: false });
  top += h3;

  // Fila 4: Fecha / Hora Inicia / Hora Fin / Duración (Horas)
  const r4Base = top + h4 - 2;
  x = label('Fecha:', x0, top, h4);
  underline(doc, 93, 177, r4Base);
  fieldValue(doc, d.event.dateShort, 93, 177, r4Base, 10, h4);
  label('Hora Inicia', 182, top, h4);
  underline(doc, 248, 311, r4Base);
  fieldValue(doc, d.event.startTime, 248, 311, r4Base, 10, h4);
  label('Hora Fin', 318, top, h4);
  underline(doc, 367, 417, r4Base);
  fieldValue(doc, d.event.endTime, 367, 417, r4Base, 10, h4);
  label('Duración: (Horas)', 424, top, h4);
  underline(doc, 511, xEnd, r4Base);
  fieldValue(doc, d.event.durationHours, 511, xEnd, r4Base, 10, h4);
}

function drawTable(doc: PDFKit.PDFDocument, page: SheetPage) {
  const top = page.tableTop;
  // Encabezado: relleno negro, texto blanco en negrita 10.5 pt
  doc.rect(TABLE_X, top, TABLE_W, HEADER_ROW_H).fill('#000000');
  let x = TABLE_X;
  doc.font(F.bold).fontSize(10.5).fillColor('#FFFFFF');
  HEADERS.forEach((h, i) => {
    const w = COLS[i];
    doc.text(h, x + (w - doc.widthOfString(h)) / 2, top + 2.2, { lineBreak: false });
    x += w;
  });

  let y = top + HEADER_ROW_H;
  const blankStart = page.rows.findIndex((r) => r.row === null);
  let blankTop = 0;
  page.rows.forEach((mr, idx) => {
    if (idx === blankStart) blankTop = y;
    const h = mr.height;
    // Número consecutivo (arriba a la izquierda, como en el formato)
    const num = String(mr.number);
    let ns = 8;
    doc.font(F.regular);
    while (doc.fontSize(ns).widthOfString(num) > COLS[0] - 2.5 && ns > 4) ns -= 0.5;
    doc.fillColor('black').text(num, TABLE_X + 1.6, y + 1.8, { lineBreak: false });

    if (mr.row) {
      const r = mr.row;
      const cells = ['', r.documentNumber, r.fullName, r.company ?? '', r.management ?? '', r.area ?? ''];
      const sizes = mr.sizes ?? [];
      let cx = TABLE_X + COLS[0];
      [1, 2, 3, 4, 5].forEach((ci) => {
        const w = COLS[ci] - CELL_PAD_X * 2;
        const fs = sizes[ci] || DATA_FONT;
        if (ci === 2) {
          doc.font(F.regular).fontSize(fs);
          const nh = doc.heightOfString(r.fullName, { width: w });
          const codeText = `Firma electrónica · Exp. ${r.evidenceCode}`;
          const ch = doc.fontSize(CODE_FONT).heightOfString(codeText, { width: w });
          const ty = y + (h - (nh + 0.5 + ch)) / 2;
          doc.fontSize(fs).fillColor('black').text(r.fullName, cx + CELL_PAD_X, ty, { width: w });
          doc.fontSize(CODE_FONT).fillColor('#176B52').text(codeText, cx + CELL_PAD_X, ty + nh + 0.5, { width: w });
        } else {
          const t = cells[ci];
          doc.font(F.regular).fontSize(fs).fillColor('black');
          const th = doc.heightOfString(t || ' ', { width: w });
          doc.text(t, cx + CELL_PAD_X, y + (h - th) / 2 + 0.3, { width: w, align: ci === 1 ? 'center' : 'left' });
        }
        cx += COLS[ci];
      });
      if (SHOW_SIGNATURE) {
        const sw = COLS[6];
        if (r.signature) {
          try {
            doc.image(r.signature, cx + 2, y + 1.5, { fit: [sw - 4, h - 3], align: 'center', valign: 'center' });
          } catch {
            doc.font(F.italic).fontSize(5.5).fillColor('#666666').text('Firma en expediente', cx + 2, y + h / 2 - 3, { width: sw - 4, align: 'center' });
          }
        } else {
          doc.font(F.italic).fontSize(5.5).fillColor('#666666').text('Firma en expediente', cx + 2, y + h / 2 - 3, { width: sw - 4, align: 'center' });
        }
      }
    }
    y += h;
  });

  // Bordes: rejilla de 0.5 pt (líneas divisorias del formato)
  doc.lineWidth(0.5).strokeColor('black');
  let ly = top + HEADER_ROW_H;
  for (const mr of page.rows) {
    ly += mr.height;
    doc.moveTo(TABLE_X, ly).lineTo(TABLE_X + TABLE_W, ly).stroke();
  }
  let vx = TABLE_X;
  for (let i = 0; i <= COLS.length; i++) {
    doc.moveTo(vx, top + (i === 0 || i === COLS.length ? 0 : HEADER_ROW_H)).lineTo(vx, ly).stroke();
    if (i < COLS.length) vx += COLS[i];
  }
  doc.moveTo(TABLE_X, top).lineTo(TABLE_X + TABLE_W, top).stroke();

  // Filas sin registros: se anulan con una línea diagonal para impedir adiciones manuales.
  if (blankStart >= 0 && ly - blankTop > 1) {
    const x1 = TABLE_X + COLS[0];
    const x2 = TABLE_X + TABLE_W;
    doc.save().lineWidth(0.6).strokeColor('#666666').moveTo(x1, ly).lineTo(x2, blankTop).stroke().restore();
    if (ly - blankTop >= MIN_ROW_H) {
      const label = 'ESPACIO SIN REGISTROS — ANULADO';
      doc.font(F.italic).fontSize(7).fillColor('#666666');
      const tx = x1 + (x2 - x1) / 2 - doc.widthOfString(label) / 2;
      const ty = blankTop + (ly - blankTop) / 2 - 3.5;
      doc.rect(tx - 3, ty - 2, doc.widthOfString(label) + 6, 11).fill('#FFFFFF');
      doc.fillColor('#666666').text(label, tx, ty, { lineBreak: false });
    }
  }
  doc.fillColor('black');
}

function drawDraftMark(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rotate(-35, { origin: [PAGE.w / 2, PAGE.h / 2] });
  doc.font(F.bold).fontSize(54).fillColor('#176B52').fillOpacity(0.08);
  const t = 'VISTA PREVIA';
  doc.text(t, PAGE.w / 2 - doc.widthOfString(t) / 2, PAGE.h / 2 - 27, { lineBreak: false });
  doc.restore();
  doc.fillOpacity(1);
}

export async function renderAttendanceSheet(d: SheetData, opts: { fillBlankRows?: boolean } = {}): Promise<{ buffer: Buffer; pages: number }> {
  const doc = createLetterDoc({
    Title: `${d.title} - ${d.event.code}`,
    Subject: `${d.formatCode} ${d.formatVersion}`,
    Author: d.companyName,
  });
  setLayout(d.showSignature ?? true);
  const pages = paginate(doc, d.rows, opts.fillBlankRows ?? true);
  pages.forEach((p, i) => {
    doc.addPage({ size: 'LETTER', margin: 0 });
    if (d.draft) drawDraftMark(doc);
    drawHeader(doc, d, i + 1, pages.length);
    if (i === 0) drawTitleAndInfo(doc, d);
    drawTable(doc, p);
    drawFooter(doc, d);
  });
  const buffer = await renderToBuffer(doc);
  return { buffer, pages: pages.length };
}

/** Solo para pruebas: calcula la paginación sin renderizar. */
export function computeSheetLayout(rows: SheetRow[], fillBlankRows = true, showSignature = true) {
  setLayout(showSignature);
  const doc = createLetterDoc({ Title: 'layout' });
  return paginate(doc, rows, fillBlankRows);
}
