import { describe, expect, it } from 'vitest';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { COLS_ORIGINAL, COLS_WITH_SIGNATURE, MIN_ROW_H, ROWS_FIRST_PAGE, ROWS_NEXT_PAGES, computeSheetLayout, renderAttendanceSheet, type SheetRow } from '@/server/documents/sheet-pdf';
import { renderReceipt } from '@/server/documents/receipt-pdf';
import { makePng } from './png';

const sig = Buffer.from(makePng(480, 140).split(',')[1], 'base64');
const rows = (n: number, name = (i: number) => `Persona ${String.fromCharCode(65 + (i % 26))} Gómez`): SheetRow[] =>
  Array.from({ length: n }, (_, i) => ({
    sequence: i + 1,
    documentNumber: String(10_000_000 + i),
    fullName: name(i),
    company: 'Empresa S.A.S.',
    management: 'Gerencia Técnica',
    area: 'Calidad',
    evidenceCode: `FQR-AAAA-BBBB-${String(i).padStart(4, '0')}`,
    signature: sig,
  }));

const data = (r: SheetRow[], showSignature = true) => ({
  companyName: 'Empresa de Pruebas',
  formatCode: '11020001F-01',
  formatVersion: 'V0.6',
  title: 'REGISTRO DE ASISTENCIA',
  event: {
    code: 'EV-2026-00001', program: 'Programa', topic: 'Tema', relatedDocument: 'DOC-1', trainer: 'Formadora', institution: 'SENA',
    classification: 'INTERNAL' as const, dateShort: '10/11/26', startTime: '08:00', endTime: '10:00', durationHours: '2',
  },
  rows: r,
  verificationCode: 'DOC-AAAA-BBBB-CCCC',
  verifyUrl: 'https://firmaqr.test/verificar/DOC-AAAA-BBBB-CCCC',
  generatedAt: '10/11/2026',
  showSignature,
});

const dataRows = (pages: ReturnType<typeof computeSheetLayout>) => pages.flatMap((p) => p.rows.filter((r) => r.row));

describe('Planilla oficial (formato 11020001F-01 V0.6)', () => {
  it('conserva el ancho total del formato y agrega la columna Firma', () => {
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    expect(sum(COLS_WITH_SIGNATURE)).toBeCloseTo(sum(COLS_ORIGINAL), 5);
    expect(COLS_WITH_SIGNATURE).toHaveLength(7);
  });

  it.each([
    [1, 1, 1],
    [25, 1, 2],
    [26, 2, 2],
    [57, 2, 3],
    [58, 3, 3],
    [120, 4, 5],
  ])('%i participantes → %i página(s) de tabla y %i en total (con la salvedad jurídica al final)', (n, tablePages, total) => {
    const layout = computeSheetLayout(rows(n));
    expect(layout.filter((p) => p.rows.length > 0)).toHaveLength(tablePages);
    expect(layout).toHaveLength(total);
    expect(layout[0].rows.length).toBeLessThanOrEqual(ROWS_FIRST_PAGE);
    layout.slice(1).forEach((p) => expect(p.rows.length).toBeLessThanOrEqual(ROWS_NEXT_PAGES));
    if (n >= 25) expect(layout[0].rows.filter((r) => r.row)).toHaveLength(25);
    const numbers = dataRows(layout).map((r) => r.number);
    expect(numbers).toEqual(Array.from({ length: n }, (_, i) => i + 1)); // numeración consecutiva, sin duplicar filas
    // La salvedad aparece una sola vez, en la última página, sin invadir la tabla ni el pie
    const withNotice = layout.filter((p) => p.noticeTop !== undefined);
    expect(withNotice).toHaveLength(1);
    expect(layout.at(-1)!.noticeTop).toBeDefined();
    const last = layout.at(-1)!;
    const tableEnd = last.tableTop + 14.5 + last.rows.reduce((a, r) => a + r.height, 0);
    if (last.rows.length) expect(last.noticeTop!).toBeGreaterThan(tableEnd);
  });

  it('57 participantes reproducen exactamente la distribución del documento de referencia (1-25 / 26-57)', () => {
    const layout = computeSheetLayout(rows(57));
    expect(layout[2].rows).toHaveLength(0); // página adicional solo para la salvedad
    expect(layout[0].rows.map((r) => r.number)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(layout[1].rows.map((r) => r.number)).toEqual(Array.from({ length: 32 }, (_, i) => i + 26));
    expect(layout.flatMap((p) => p.rows).every((r) => r.height === MIN_ROW_H)).toBe(true);
  });

  it('no trunca nombres largos ni divide filas entre páginas', async () => {
    const long = 'Andrés Felipe Rodríguez Castaño de la Espriella y Villamizar Londoño Restrepo Arango';
    const r = rows(40, (i) => (i % 3 === 0 ? long : `Ana ${i}`));
    const layout = computeSheetLayout(r);
    for (const p of layout) {
      const used = p.rows.reduce((a, x) => a + x.height, 0);
      expect(p.tableTop + 14.5 + used).toBeLessThanOrEqual(727.6);
    }
    expect(dataRows(layout)).toHaveLength(40);
    const { buffer } = await renderAttendanceSheet(data(r));
    const text = (await pdfParse(buffer)).text.replace(/\s+/g, ' ');
    expect(text).toContain('Rodríguez Castaño de la Espriella');
    expect(text).toContain('Londoño Restrepo Arango');
    expect(text).toContain('10000039');
  });

  it('el PDF contiene el encabezado institucional, campos del evento, columnas y pie de formato', async () => {
    const { buffer, pages } = await renderAttendanceSheet(data(rows(60)));
    expect(pages).toBe(3);
    const pdf = await pdfParse(buffer);
    expect(pdf.numpages).toBe(3);
    const flat = pdf.text.replace(/\s+/g, ' ');
    for (const s of ['SALVEDAD SOBRE EL USO DE LA FIRMA ELECTRÓNICA', 'artículo 7 de la Ley 527 de 1999', 'Decreto 2364 de 2012', 'no acredita la identidad del firmante', 'No es una firma digital certificada', 'artículo 28', 'carece de validez', 'Ley 1581 de 2012', 'Empresa de Pruebas', 'https://firmaqr.test/verificar/DOC-AAAA-BBBB-CCCC', 'Total de asistentes con firma electrónica en esta planilla: 60']) {
      expect(flat).toContain(s);
    }
    expect(flat.match(/Sujeta a la SALVEDAD/g)).toHaveLength(3); // referencia en cada página
    const t = pdf.text;
    for (const s of ['REGISTRO DE ASISTENCIA', 'Programa / Tema / Documento:', 'Formador:', 'Institución:', 'Interno:', 'Externo:', 'Fecha:', 'Hora Inicia', 'Hora Fin', 'Duración: (Horas)', 'Cédula', 'Nombre y Apellidos', 'Empresa', 'Gerencia', 'Área', 'Firma', '11020001F-01 V0.6', 'Programa / Tema / DOC-1', '10/11/26', 'SENA']) {
      expect(t).toContain(s);
    }
    expect(t.match(/11020001F-01 V0\.6/g)).toHaveLength(3); // pie en cada página
    expect(t).toMatch(/Página\s*1\s*de\s*3/);
    expect(t).toMatch(/Página\s*3\s*de\s*3/);
    expect(t).toContain('DOC-AAAA-BBBB-CCCC');
  });

  it('se puede generar sin columna Firma (configuración)', async () => {
    const { buffer } = await renderAttendanceSheet(data(rows(3), false));
    expect((await pdfParse(buffer)).text).not.toMatch(/Área\s*Firma/);
  });

  it('comprobante individual con todos los campos requeridos', async () => {
    const buf = await renderReceipt({
      companyName: 'Empresa de Pruebas',
      participant: { fullName: 'Ana María Gómez', documentNumber: '1037654321', company: 'Empresa', management: 'Gerencia X', area: 'Área Y', email: 'ana@x.co' },
      event: { code: 'EV-2026-00001', name: 'Inducción', program: 'Programa BPM', topic: 'Tema', relatedDocument: null, trainer: 'Formadora', institution: 'SENA', classification: 'Interno', dateText: '10 de noviembre de 2026', schedule: '08:00 a 10:00', durationHours: '2', location: 'Auditorio' },
      record: { id: 'uuid-1', evidenceCode: 'FQR-AAAA-BBBB-CCCC', registeredAt: '10/11/2026 08:15:00', authMethod: 'Código OTP por correo electrónico', authDestination: 'an*@x.co', otpVerifiedAt: '10/11/2026 08:14:00', agreementVersion: '1.0', dataConsentVersion: '1.0', evidenceHash: 'a'.repeat(64), signatureSha256: 'b'.repeat(64) },
      signaturePng: sig,
      verifyUrl: 'https://firmaqr.test/verificar/FQR-AAAA-BBBB-CCCC',
      generatedAt: '10/11/2026',
    });
    const t = (await pdfParse(buf)).text;
    for (const s of ['COMPROBANTE DE ASISTENCIA', 'Ana María Gómez', '1037654321', 'Gerencia X', 'Área Y', 'Programa BPM', 'Formadora', 'SENA', '10 de noviembre de 2026', '08:15:00', 'FQR-AAAA-BBBB-CCCC', 'Código OTP por correo electrónico', 'a'.repeat(64), 'Firma manuscrita electrónica', 'Verificación del documento']) {
      expect(t).toContain(s);
    }
  });
});
