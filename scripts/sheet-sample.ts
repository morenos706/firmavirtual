import fs from 'node:fs';
import { renderAttendanceSheet, type SheetRow } from '../src/server/documents/sheet-pdf';
import { makePng } from '../tests/png';

const sig = Buffer.from(makePng(480, 140).split(',')[1], 'base64');

const n = Number(process.argv[2] ?? 30);
const out = process.argv[3] ?? 'sheet.pdf';
const names = ['María Fernanda Gómez Restrepo', 'Juan Camilo Pérez', 'Luz Ángela Muñoz Ospina', 'Andrés Felipe Rodríguez Castaño de la Espriella y Villamizar Londoño', 'Sofía Ramírez'];
const rows: SheetRow[] = Array.from({ length: n }, (_, i) => ({
  sequence: i + 1,
  documentNumber: String(1000000000 + i * 7919),
  fullName: names[i % names.length],
  company: i % 3 ? 'Prebel S.A. BIC' : 'Contratista Servicios Integrales S.A.S.',
  management: 'Gerencia de Operaciones',
  area: i % 2 ? 'Producción' : 'Aseguramiento de Calidad',
  evidenceCode: `FQR-AB${String(i).padStart(2, '0')}-CD7K-9XPZ`,
  signature: sig,
}));
renderAttendanceSheet({
  companyName: 'Empresa Demo S.A.S.',
  formatCode: '11020001F-01',
  formatVersion: 'V0.6',
  title: 'REGISTRO DE ASISTENCIA',
  event: {
    code: 'EV-2026-00001',
    program: 'Programa de Buenas Prácticas de Manufactura',
    topic: 'Inducción BPM y manejo seguro de químicos',
    relatedDocument: 'PR-CAL-014',
    trainer: 'Carolina Vélez',
    institution: 'SENA',
    classification: 'INTERNAL',
    dateShort: '10/11/26',
    startTime: '08:00',
    endTime: '10:00',
    durationHours: '2',
  },
  rows,
  verificationCode: 'PLN-7K2M-9X4P-QW3E',
  verifyUrl: 'http://localhost:3000/verificar',
  generatedAt: '10/11/2026 10:15:00',
  logo: process.env.LOGO ? fs.readFileSync(process.env.LOGO) : null,
}).then(({ buffer, pages }) => {
  fs.writeFileSync(out, buffer);
  console.log(out, pages, 'páginas', buffer.length, 'bytes');
});
