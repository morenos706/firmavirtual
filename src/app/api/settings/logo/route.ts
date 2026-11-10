import { api, actorFrom, fileResponse, json } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { getSettings } from '@/lib/settings';
import { getFile, putFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
/** Logo institucional (público: se muestra en el formulario de registro y en la página de verificación). */
export const GET = api(async () => {
  const s = await getSettings();
  if (!s.logoPath) throw Errors.notFound('Logo');
  return fileResponse(await getFile(s.logoPath), 'logo', s.logoMime ?? 'image/png', true);
}, { csrf: false });

function sniff(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

export const POST = api(async (req) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const form = await req.formData();
  const file = form.get('logo');
  if (!(file instanceof File)) throw Errors.badRequest('Adjunte un archivo de imagen.');
  if (file.size > 1_000_000) throw Errors.badRequest('El logo no debe superar 1 MB.');
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime) throw Errors.badRequest('Formato no permitido. Use PNG o JPG.');
  const stored = await putFile(`branding/logo-${Date.now()}.${mime === 'image/png' ? 'png' : 'jpg'}`, buf);
  await prisma.appSettings.update({ where: { id: 1 }, data: { logoPath: stored.path, logoMime: mime } });
  await audit(actorFrom(req, u), { action: 'LOGO_UPDATED', entityType: 'settings', entityId: '1', details: { sha256: stored.sha256, size: stored.size } });
  return json({ ok: true });
});

export const DELETE = api(async (req) => {
  const u = await requireApiUser(req, ['ADMIN']);
  await prisma.appSettings.update({ where: { id: 1 }, data: { logoPath: null, logoMime: null } });
  await audit(actorFrom(req, u), { action: 'LOGO_REMOVED', entityType: 'settings', entityId: '1' });
  return json({ ok: true });
});
