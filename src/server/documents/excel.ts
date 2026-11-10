import ExcelJS from 'exceljs';

export type AttendanceExportRow = {
  sequence: number | null;
  documentNumber: string;
  fullName: string;
  company: string | null;
  management: string | null;
  area: string | null;
  email: string;
  status: string;
  completedAt: string;
  authMethod: string;
  evidenceCode: string;
  evidenceHash: string;
  emailStatus?: string;
};

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172C3C' } };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 22;
}

export function eventInfoRows(ws: ExcelJS.Worksheet, ev: Record<string, string>) {
  for (const [k, v] of Object.entries(ev)) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: 'FF176B52' } };
  }
}

function attendanceSheet(wb: ExcelJS.Workbook, rows: AttendanceExportRow[], withEmail: boolean) {
  const ws = wb.addWorksheet('Asistentes', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: '#', key: 'sequence', width: 6 },
    { header: 'Cédula', key: 'documentNumber', width: 16 },
    { header: 'Nombre y Apellidos', key: 'fullName', width: 36 },
    { header: 'Empresa', key: 'company', width: 24 },
    { header: 'Gerencia', key: 'management', width: 24 },
    { header: 'Área', key: 'area', width: 24 },
    { header: 'Correo electrónico', key: 'email', width: 30 },
    { header: 'Estado', key: 'status', width: 14 },
    { header: 'Fecha y hora de firma', key: 'completedAt', width: 22 },
    { header: 'Autenticación', key: 'authMethod', width: 14 },
    { header: 'Código de evidencia', key: 'evidenceCode', width: 22 },
    { header: 'Huella SHA-256 de evidencia', key: 'evidenceHash', width: 68 },
    ...(withEmail ? [{ header: 'Estado del comprobante', key: 'emailStatus', width: 22 }] : []),
  ];
  styleHeader(ws.getRow(1));
  for (const r of rows) {
    const row = ws.addRow(r);
    row.getCell('documentNumber').numFmt = '@';
  }
  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } };
  return ws;
}

export async function attendanceWorkbook(info: Record<string, string>, rows: AttendanceExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FirmaQR';
  wb.created = new Date();
  attendanceSheet(wb, rows, true);
  const ws = wb.addWorksheet('Evento');
  ws.columns = [{ width: 28 }, { width: 70 }];
  eventInfoRows(ws, info);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type ClosingMetrics = {
  registered: number;
  signed: number;
  valid: number;
  sheets: number;
  receipts: number;
  emailsSent: number;
  emailsDelivered: number;
  emailsPending: number;
  emailsFailed: number;
};

export const METRIC_LABELS: [keyof ClosingMetrics, string][] = [
  ['registered', 'Total de participantes registrados'],
  ['signed', 'Total de firmas completadas'],
  ['valid', 'Total de asistencias válidas'],
  ['sheets', 'Total de planillas generadas'],
  ['receipts', 'Total de comprobantes generados'],
  ['emailsSent', 'Total de correos enviados (aceptados por el proveedor o entregados)'],
  ['emailsDelivered', 'Correos con entrega confirmada'],
  ['emailsPending', 'Correos pendientes'],
  ['emailsFailed', 'Correos fallidos o rechazados'],
];

export async function closingReportWorkbook(info: Record<string, string>, m: ClosingMetrics, rows: AttendanceExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FirmaQR';
  const ws = wb.addWorksheet('Informe de cierre');
  ws.columns = [{ width: 60 }, { width: 70 }];
  const t = ws.addRow(['INFORME DE CIERRE DE EVENTO']);
  t.font = { bold: true, size: 14, color: { argb: 'FF172C3C' } };
  ws.addRow([]);
  eventInfoRows(ws, info);
  ws.addRow([]);
  styleHeader(ws.addRow(['Indicador', 'Valor']));
  for (const [k, label] of METRIC_LABELS) ws.addRow([label, m[k]]);
  attendanceSheet(wb, rows, true);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
