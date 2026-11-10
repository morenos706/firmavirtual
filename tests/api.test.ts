import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as listUsers, POST as createUserApi } from '@/app/api/users/route';
import { GET as listEvents, POST as createEventApi } from '@/app/api/events/route';
import { GET as getEvent, PUT as putEvent } from '@/app/api/events/[id]/route';
import { GET as qrGet, POST as qrPost } from '@/app/api/events/[id]/qr/route';
import { POST as statusPost } from '@/app/api/events/[id]/status/route';
import { POST as closePost } from '@/app/api/events/[id]/close/route';
import { GET as sheetGet } from '@/app/api/events/[id]/sheet/route';
import { GET as exportGet } from '@/app/api/events/[id]/export/route';
import { GET as receiptsGet } from '@/app/api/events/[id]/receipts/route';
import { GET as auditGet } from '@/app/api/audit/route';
import { GET as settingsGet } from '@/app/api/settings/route';
import { GET as docGet } from '@/app/api/documents/[id]/route';
import { POST as resendPost } from '@/app/api/records/[id]/resend/route';
import { POST as startPost } from '@/app/api/public/r/[token]/start/route';
import { GET as verifyGet } from '@/app/api/public/verify/[code]/route';
import { POST as webhookPost } from '@/app/api/webhooks/email/route';
import { GET as setupGet, POST as setupPost } from '@/app/api/setup/route';
import { prisma } from '@/lib/db';
import { eventInput, makeUser, registerParticipant, resetDb } from './helpers';

const BASE = 'https://firmaqr.test';
function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; csrf?: boolean; origin?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json', 'user-agent': 'vitest', host: 'firmaqr.test' });
  if (opts.csrf !== false && opts.method && opts.method !== 'GET') headers.set('x-requested-with', 'FirmaQR');
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.origin) headers.set('origin', opts.origin);
  return new NextRequest(BASE + path, { method: opts.method ?? 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
}
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) as never });

async function loginAs(email: string, password = 'Clave-Segura-2026') {
  const res = await login(req('/api/auth/login', { method: 'POST', body: { email, password } }), ctx({}));
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0];
}

describe('API: autenticación, CSRF y permisos', () => {
  beforeEach(resetDb);

  it('inicio de sesión: credenciales inválidas, bloqueo tras 5 intentos y sesión con cookie HttpOnly', async () => {
    const admin = await makeUser('ADMIN', 'admin@test.co');
    const bad = await login(req('/api/auth/login', { method: 'POST', body: { email: admin.email, password: 'mala' } }), ctx({}));
    expect(bad.status).toBe(401);
    const res = await login(req('/api/auth/login', { method: 'POST', body: { email: admin.email, password: 'Clave-Segura-2026' } }), ctx({}));
    expect(res.headers.get('set-cookie')).toMatch(/fqr_session=.*HttpOnly/i);
    for (let i = 0; i < 5; i++) await login(req('/api/auth/login', { method: 'POST', body: { email: admin.email, password: 'mala' } }), ctx({}));
    const locked = await login(req('/api/auth/login', { method: 'POST', body: { email: admin.email, password: 'Clave-Segura-2026' } }), ctx({}));
    expect(locked.status).toBe(401);
    expect((await locked.json()).error.message).toMatch(/bloqueado/);
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_FAILED' } })).toBe(7);
  });

  it('rechaza peticiones sin sesión (401) y sin protección CSRF u otro origen (403)', async () => {
    const admin = await makeUser('ADMIN');
    const cookie = await loginAs(admin.email);
    expect((await listEvents(req('/api/events'), ctx({}))).status).toBe(401);
    expect((await createEventApi(req('/api/events', { method: 'POST', body: eventInput(), cookie, csrf: false }), ctx({}))).status).toBe(403);
    expect((await createEventApi(req('/api/events', { method: 'POST', body: eventInput(), cookie, origin: 'https://atacante.com' }), ctx({}))).status).toBe(403);
    expect((await createEventApi(req('/api/events', { method: 'POST', body: eventInput(), cookie, origin: BASE }), ctx({}))).status).toBe(201);
  });

  it('el organizador no accede a funciones de administrador ni a eventos ajenos', async () => {
    const admin = await makeUser('ADMIN');
    const org1 = await makeUser('ORGANIZER');
    const org2 = await makeUser('ORGANIZER');
    const c1 = await loginAs(org1.email);
    const c2 = await loginAs(org2.email);
    const ca = await loginAs(admin.email);
    for (const h of [() => auditGet(req('/api/audit', { cookie: c1 }), ctx({})), () => settingsGet(req('/api/settings', { cookie: c1 }), ctx({}))]) expect((await h()).status).toBe(403);
    expect((await createUserApi(req('/api/users', { method: 'POST', cookie: c1, body: { email: 'x@y.co', name: 'X', role: 'ADMIN', password: 'Clave-Segura-2026' } }), ctx({}))).status).toBe(403);
    const users = await (await listUsers(req('/api/users', { cookie: c1 }), ctx({}))).json();
    expect(users.users[0]).not.toHaveProperty('email');

    const created = await (await createEventApi(req('/api/events', { method: 'POST', cookie: c1, body: eventInput() }), ctx({}))).json();
    const id = created.event.id;
    expect(created.event.code).toMatch(/^EV-2026-\d{5}$/);
    // org2 no ve ni modifica el evento de org1
    expect((await getEvent(req(`/api/events/${id}`, { cookie: c2 }), ctx({ id }))).status).toBe(403);
    expect((await putEvent(req(`/api/events/${id}`, { method: 'PUT', cookie: c2, body: { data: eventInput() } }), ctx({ id }))).status).toBe(403);
    expect((await closePost(req(`/api/events/${id}/close`, { method: 'POST', cookie: c2 }), ctx({ id }))).status).toBe(403);
    expect((await (await listEvents(req('/api/events', { cookie: c2 }), ctx({}))).json()).events).toHaveLength(0);
    expect((await (await listEvents(req('/api/events', { cookie: ca }), ctx({}))).json()).events).toHaveLength(1);
    // org1 no puede asignar otro organizador
    expect((await createEventApi(req('/api/events', { method: 'POST', cookie: c1, body: eventInput({ organizerId: org2.id }) }), ctx({}))).status).toBe(403);
  });

  it('flujo HTTP: QR (PNG/PDF, activar/desactivar), registro público, cierre, descargas y verificación', async () => {
    const admin = await makeUser('ADMIN');
    const org = await makeUser('ORGANIZER');
    const co = await loginAs(org.email);
    const ca = await loginAs(admin.email);
    const { event } = await (await createEventApi(req('/api/events', { method: 'POST', cookie: co, body: eventInput() }), ctx({}))).json();
    const id = event.id;
    const png = await qrGet(req(`/api/events/${id}/qr?format=png`, { cookie: co }), ctx({ id }));
    expect(png.headers.get('content-type')).toBe('image/png');
    const pdf = await qrGet(req(`/api/events/${id}/qr?format=pdf`, { cookie: co }), ctx({ id }));
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
    const detail = await (await getEvent(req(`/api/events/${id}`, { cookie: co }), ctx({ id }))).json();
    const token = detail.event.qr.url.split('/r/')[1];
    expect(detail.event.qr.url).not.toMatch(/@|\d{6,}/); // el QR no contiene datos personales

    // Borrador: el registro aún no está habilitado
    const early = await startPost(req(`/api/public/r/${token}/start`, { method: 'POST', body: {} }), ctx({ token }));
    expect(early.status).toBe(410);
    expect((await statusPost(req(`/api/events/${id}/status`, { method: 'POST', cookie: co, body: { status: 'ACTIVE' } }), ctx({ id }))).status).toBe(200);
    await qrPost(req(`/api/events/${id}/qr`, { method: 'POST', cookie: co, body: { action: 'deactivate' } }), ctx({ id }));
    expect((await startPost(req(`/api/public/r/${token}/start`, { method: 'POST', body: {} }), ctx({ token }))).status).toBe(410);
    await qrPost(req(`/api/events/${id}/qr`, { method: 'POST', cookie: co, body: { action: 'activate' } }), ctx({ id }));
    const r1 = await registerParticipant(token, 1);
    await registerParticipant(token, 2);

    const preview = await sheetGet(req(`/api/events/${id}/sheet`, { cookie: co }), ctx({ id }));
    expect(preview.headers.get('content-disposition')).toContain('VistaPrevia');
    const close = await closePost(req(`/api/events/${id}/close`, { method: 'POST', cookie: co }), ctx({ id }));
    expect(close.status).toBe(200);
    const final = await sheetGet(req(`/api/events/${id}/sheet`, { cookie: co }), ctx({ id }));
    expect(final.headers.get('content-disposition')).toContain('Planilla_Asistencia_EV-2026');
    const xlsx = await exportGet(req(`/api/events/${id}/export`, { cookie: co }), ctx({ id }));
    expect(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString()).toBe('PK');
    // Evento cerrado: no se puede editar
    expect((await putEvent(req(`/api/events/${id}`, { method: 'PUT', cookie: co, body: { data: eventInput({ trainer: 'Otro' }) } }), ctx({ id }))).status).toBe(403);
    expect((await putEvent(req(`/api/events/${id}`, { method: 'PUT', cookie: ca, body: { data: eventInput({ trainer: 'Otro' }), justification: 'Corrección de error de digitación' } }), ctx({ id }))).status).toBe(409);
    expect((await putEvent(req(`/api/events/${id}`, { method: 'PUT', cookie: ca, body: { data: eventInput({ location: 'Sala 2' }) } }), ctx({ id }))).status).toBe(400);
    expect((await putEvent(req(`/api/events/${id}`, { method: 'PUT', cookie: ca, body: { data: eventInput({ location: 'Sala 2' }), justification: 'Corrección de error de digitación' } }), ctx({ id }))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'EVENT_POST_CLOSE_CORRECTION' } })).toBe(1);

    // Panel de comprobantes: organizador consulta, pero no descarga ni reenvía
    const panel = await (await receiptsGet(req(`/api/events/${id}/receipts`, { cookie: co }), ctx({ id }))).json();
    expect(panel.items).toHaveLength(2);
    expect(panel.items[0].emailStatus).toBe('PENDING');
    expect(panel.canResend).toBe(false);
    const docId = panel.items[0].document.id;
    expect((await docGet(req(`/api/documents/${docId}`, { cookie: co }), ctx({ id: docId }))).status).toBe(403);
    expect((await docGet(req(`/api/documents/${docId}`, { cookie: ca }), ctx({ id: docId }))).status).toBe(200);
    expect((await receiptsGet(req(`/api/events/${id}/receipts?download=zip`, { cookie: co }), ctx({ id }))).status).toBe(403);
    const zip = await receiptsGet(req(`/api/events/${id}/receipts?download=zip`, { cookie: ca }), ctx({ id }));
    expect(zip.headers.get('content-type')).toBe('application/zip');
    const rid = panel.items[0].recordId;
    expect((await resendPost(req(`/api/records/${rid}/resend`, { method: 'POST', cookie: co, body: {} }), ctx({ id: rid }))).status).toBe(403);

    // Verificación pública
    const v = await (await verifyGet(req(`/api/public/verify/${r1.evidenceCode}`), ctx({ code: r1.evidenceCode }))).json();
    expect(v.found).toBe(true);
    expect(JSON.stringify(v)).not.toContain(r1.data.documentNumber);
  });

  it('instalación inicial desde el navegador: solo sin administradores y con código si está definido', async () => {
    expect((await (await setupGet(req('/api/setup'), ctx({}))).json()).needsSetup).toBe(true);
    process.env.SETUP_TOKEN = 'codigo-instalacion-123';
    const body = { companyName: 'PREBEL S.A.', name: 'Admin Prebel', email: 'admin@prebel.test', password: 'Clave-Segura-2026' };
    expect((await setupPost(req('/api/setup', { method: 'POST', body: { ...body, setupToken: 'malo' } }), ctx({}))).status).toBe(403);
    expect((await setupPost(req('/api/setup', { method: 'POST', body: { ...body, setupToken: 'codigo-instalacion-123' } }), ctx({}))).status).toBe(201);
    delete process.env.SETUP_TOKEN;
    expect((await setupPost(req('/api/setup', { method: 'POST', body: { ...body, email: 'otro@prebel.test' } }), ctx({}))).status).toBe(409);
    expect((await (await setupGet(req('/api/setup'), ctx({}))).json()).needsSetup).toBe(false);
    const cookie = await loginAs('admin@prebel.test');
    expect(cookie).toContain('fqr_session=');
    expect((await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } })).logoPath).toBe('branding/prebel-logo-azul.png');
  });

  it('webhook de proveedor exige secreto compartido', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = 'secreto-webhook';
    const r = (token?: string) => new NextRequest(`${BASE}/api/webhooks/email${token ? `?token=${token}` : ''}`, { method: 'POST', body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } }) });
    expect((await webhookPost(r(), ctx({}))).status).toBe(401);
    expect((await webhookPost(r('malo-malo-malo1'), ctx({}))).status).toBe(401);
    const ok = await webhookPost(r('secreto-webhook'), ctx({}));
    expect(await ok.json()).toEqual({ received: 1, matched: 0 });
  });
});
