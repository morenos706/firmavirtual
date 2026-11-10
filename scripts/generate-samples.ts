/** Genera PDF de muestra de la planilla (1, 25, 57 y 120 asistentes) y de un comprobante en docs/muestras. */
import fs from 'node:fs';
import { renderAttendanceSheet, type SheetRow } from '../src/server/documents/sheet-pdf';
import { renderReceipt } from '../src/server/documents/receipt-pdf';
import { makePng } from '../tests/png';

const OUT = 'docs/muestras';
fs.mkdirSync(OUT, { recursive: true });
const sig = Buffer.from(makePng(480, 140).split(',')[1], 'base64');
const NAMES = ['María Fernanda Gómez Restrepo', 'Juan Camilo Pérez', 'Luz Ángela Muñoz Ospina', 'Andrés Felipe Rodríguez Castaño', 'Sofía Ramírez Arango', 'Ñusta Valentina Quintero'];
const rows = (n: number): SheetRow[] =>
  Array.from({ length: n }, (_, i) => ({
    sequence: i + 1,
    documentNumber: String(1_000_000_000 + i * 7919),
    fullName: NAMES[i % NAMES.length],
    company: i % 3 ? 'Empresa Demo S.A.S.' : 'Contratista Servicios Integrales S.A.S.',
    management: 'Gerencia de Operaciones',
    area: i % 2 ? 'Producción' : 'Aseguramiento de Calidad',
    evidenceCode: `FQR-DEMO-${String(i).padStart(4, '0')}-X7KP`,
    signature: sig,
  }));
const base = {
  companyName: 'Empresa Demo S.A.S.', formatCode: '11020001F-01', formatVersion: 'V0.6', title: 'REGISTRO DE ASISTENCIA',
  event: { code: 'EV-2026-00001', program: 'Programa de Buenas Prácticas de Manufactura', topic: 'Inducción BPM', relatedDocument: 'PR-CAL-014', trainer: 'Carolina Vélez', institution: 'SENA', classification: 'INTERNAL' as const, dateShort: '10/11/26', startTime: '08:00', endTime: '10:00', durationHours: '2' },
  verificationCode: 'DOC-DEMO-0000-0001', verifyUrl: 'https://firmaqr.empresa.co/verificar/DOC-DEMO-0000-0001', generatedAt: '10/11/2026 10:15:00',
};
(async () => {
  for (const n of [1, 25, 57, 120]) {
    const { buffer, pages } = await renderAttendanceSheet({ ...base, rows: rows(n) });
    fs.writeFileSync(`${OUT}/planilla-${n}-asistentes.pdf`, buffer);
    console.log(`planilla ${n} asistentes → ${pages} página(s)`);
  }
  const r = await renderReceipt({
    companyName: 'Empresa Demo S.A.S.', companyNit: '900.123.456-7',
    participant: { fullName: 'María Fernanda Gómez Restrepo', documentNumber: '1037654321', company: 'Empresa Demo S.A.S.', management: 'Gerencia de Operaciones', area: 'Producción', email: 'maria.gomez@empresa.co' },
    event: { code: 'EV-2026-00001', name: 'Inducción BPM 2026', program: 'Programa de Buenas Prácticas de Manufactura', topic: 'Inducción BPM', relatedDocument: 'PR-CAL-014', trainer: 'Carolina Vélez', institution: 'SENA', classification: 'Interno', dateText: '10 de noviembre de 2026', schedule: '08:00 a 10:00', durationHours: '2', location: 'Auditorio principal' },
    record: { id: '6f1c2a9e-1b7d-4a8e-9a51-1f0c3d2b7e44', evidenceCode: 'FQR-DEMO-0000-X7KP', registeredAt: '10/11/2026 08:14:52 (hora de Colombia)', authMethod: 'Código OTP por correo electrónico', authDestination: 'ma*****@empresa.co', otpVerifiedAt: '10/11/2026 08:13:40', agreementVersion: '1.0', dataConsentVersion: '1.0', evidenceHash: 'a3f1c9…'.padEnd(64, '0'), signatureSha256: '5b2e…'.padEnd(64, '0') },
    signaturePng: sig, verifyUrl: 'https://firmaqr.empresa.co/verificar/FQR-DEMO-0000-X7KP', generatedAt: '10/11/2026 10:15:00',
  });
  fs.writeFileSync(`${OUT}/comprobante-individual.pdf`, r);
  console.log('comprobante → ok');
})();
