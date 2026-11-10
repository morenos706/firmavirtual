/**
 * Prueba de extremo a extremo en navegador real (Chromium/Playwright) contra un servidor en ejecución.
 * Requiere: servidor en E2E_BASE_URL (por defecto http://localhost:3100) con EMAIL_PROVIDER=file (lee el OTP del buzón local).
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100';
const OUT = process.env.E2E_OUT || './test-results';
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || 'admin@firmaqr.local', password: process.env.E2E_ADMIN_PASSWORD || 'FirmaQR-Admin-2026' };
fs.mkdirSync(OUT, { recursive: true });

/** Lee el OTP del buzón de desarrollo (EMAIL_PROVIDER=file → storage/outbox). */
function readOtp(email: string): string {
  const dir = `${process.env.STORAGE_DIR || './storage'}/outbox`;
  const msgs = fs.readdirSync(dir).map((d) => ({ d, m: JSON.parse(fs.readFileSync(`${dir}/${d}/message.json`, 'utf8')), t: fs.statSync(`${dir}/${d}`).mtimeMs }));
  const hit = msgs.filter((x) => x.m.to === email && /verificación/.test(x.m.subject)).sort((a, b) => b.t - a.t)[0];
  if (!hit) throw new Error(`OTP no encontrado para ${email}`);
  return /(\d{6})/.exec(hit.m.subject)![1];
}

function step(n: string) {
  console.log(`✔ ${n}`);
}

let current: import('playwright').Page | null = null;
(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await desk.newPage();
  current = page;

  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL(/\/login/);
  await page.fill('input[type=email]', ADMIN.email);
  await page.fill('input[type=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/dashboard/);
  await page.getByText('Crear nuevo evento').first().waitFor();
  await page.screenshot({ path: `${OUT}/01-dashboard.png` });
  step('Inicio de sesión y dashboard');

  await page.goto(`${BASE}/eventos/nuevo`);
  const fill = async (label: string, value: string) => page.locator('label', { hasText: label }).locator('input').first().fill(value);
  await fill('Programa', 'Programa de Seguridad y Salud en el Trabajo');
  await fill('Tema', 'Uso de elementos de protección personal');
  await fill('Documento relacionado', 'SST-PR-021');
  await fill('Nombre del evento', `Capacitación EPP ${Date.now().toString().slice(-5)}`);
  await fill('Formador', 'Laura Jiménez');
  await fill('Institución', 'ARL Sura');
  await fill('Lugar', 'Sala de capacitación 2');
  await page.screenshot({ path: `${OUT}/02-nuevo-evento.png`, fullPage: true });
  await page.getByRole('button', { name: 'Crear evento' }).click();
  await page.waitForURL(/\/eventos\/(?!nuevo)[a-z0-9]+$/);
  const eventUrl = page.url();
  step('Creación de evento');

  await page.getByRole('button', { name: 'Activar registro' }).click();
  await page.getByText('Activo', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Código QR' }).click();
  const qrUrl = await page.locator('input[readonly]').inputValue();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-qr.png` });
  step(`QR generado → ${qrUrl}`);

  // Participantes desde un celular
  for (let i = 1; i <= 2; i++) {
    const phone = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await phone.newPage();
    await p.goto(qrUrl);
    await p.getByText('Sus datos').waitFor();
    const inputs = p.locator('form input');
    const vals = [`10${i}2345678`, i === 1 ? 'María José Ospina Ruiz' : 'Juan Camilo Pérez Gómez', 'Empresa Demo S.A.S.', 'Gerencia de Operaciones', 'Producción', `participante${i}@correo.co`];
    for (let k = 0; k < vals.length; k++) await inputs.nth(k).fill(vals[k]);
    if (i === 1) await p.screenshot({ path: `${OUT}/04-movil-datos.png` });
    await p.getByRole('button', { name: 'Continuar' }).click();
    await p.getByText('Verifique su identidad').waitFor();
    await p.fill('input[aria-label="Código OTP"]', readOtp(`participante${i}@correo.co`));
    await p.getByRole('button', { name: 'Verificar código' }).click();
    await p.getByText('He leído y').waitFor();
    if (i === 1) await p.screenshot({ path: `${OUT}/05-movil-acuerdo.png` });
    for (const cb of await p.locator('input[type=checkbox]').all()) await cb.check();
    await p.getByRole('button', { name: 'Aceptar y continuar' }).click();
    const canvas = p.locator('canvas');
    await canvas.waitFor();
    const box = (await canvas.boundingBox())!;
    await p.mouse.move(box.x + 30, box.y + box.height * 0.6);
    await p.mouse.down();
    for (let t = 0; t <= 40; t++) await p.mouse.move(box.x + 30 + t * 7, box.y + box.height * (0.6 - 0.25 * Math.sin(t / 4)), { steps: 2 });
    await p.mouse.up();
    await p.mouse.move(box.x + 120, box.y + box.height * 0.3);
    await p.mouse.down();
    await p.mouse.move(box.x + 160, box.y + box.height * 0.75, { steps: 12 });
    await p.mouse.up();
    if (i === 1) await p.screenshot({ path: `${OUT}/06-movil-firma.png` });
    await p.getByRole('button', { name: 'Confirmar firma' }).click();
    await p.getByRole('button', { name: 'Confirmar registro' }).click();
    await p.getByText('¡Asistencia registrada!').waitFor();
    if (i === 1) await p.screenshot({ path: `${OUT}/07-movil-confirmado.png` });
    await phone.close();
    step(`Participante ${i}: datos → OTP → acuerdo → firma → confirmación`);
  }

  await page.goto(eventUrl);
  await page.getByRole('button', { name: 'Asistentes' }).click();
  await page.getByText('María José Ospina Ruiz').waitFor();
  await page.screenshot({ path: `${OUT}/08-asistentes.png` });
  step('Asistentes visibles en el panel');

  await page.getByRole('button', { name: 'Cerrar evento' }).click();
  await page.getByText('Esta acción no se puede deshacer').waitFor();
  await page.screenshot({ path: `${OUT}/09-advertencia-cierre.png` });
  await page.getByRole('button', { name: 'Sí, cerrar evento' }).click();
  await page.getByText('Participantes registrados').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.reload();
  await page.getByRole('button', { name: 'Comprobantes enviados' }).click();
  await page.getByText('participante1@correo.co').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/10-comprobantes.png`, fullPage: true });
  step('Cierre del evento y panel de comprobantes');

  const sheet = await page.request.get(`${BASE}/api/events/${eventUrl.split('/').pop()}/sheet`);
  fs.writeFileSync(`${OUT}/planilla.pdf`, await sheet.body());
  const status = await page.locator('table').innerText();
  if (!/Enviado al proveedor|Entregado/.test(status)) throw new Error('Los comprobantes no fueron enviados: ' + status);
  step('Comprobantes aceptados por el proveedor de correo');

  // Registro posterior al cierre
  const late = await browser.newContext({ ...devices['Pixel 7'] });
  const lp = await late.newPage();
  await lp.goto(qrUrl);
  await lp.getByText('Registro no disponible').waitFor();
  await late.close();
  step('Registro posterior al cierre bloqueado');

  // Verificación pública
  const receipts = await (await page.request.get(`${BASE}/api/events/${eventUrl.split('/').pop()}/receipts`)).json();
  const code = receipts.items[0].evidenceCode;
  const pub = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const vp = await pub.newPage();
  await vp.goto(`${BASE}/verificar/${code}`);
  await vp.getByText('existente y vigente').waitFor();
  await vp.screenshot({ path: `${OUT}/11-verificacion.png`, fullPage: true });
  await pub.close();
  step(`Verificación pública de ${code}`);

  await browser.close();
  console.log('\nE2E OK');
})().catch(async (e) => {
  await current?.screenshot({ path: `${OUT}/error.png`, fullPage: true }).catch(() => {});
  console.error('E2E FALLÓ:', e, current?.url());
  process.exit(1);
});
