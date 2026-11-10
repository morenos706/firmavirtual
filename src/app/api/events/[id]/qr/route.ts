import { z } from 'zod';
import { api, actorFrom, fileResponse, json, parseJson, type Ctx } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { Errors } from '@/lib/errors';
import { fmtEventDateLong } from '@/lib/format';
import { loadEventFor } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { qrPng, qrPosterPdf } from '@/server/documents/qr';
import { loadLogo } from '@/server/documents/service';
import { registrationUrl, rotateQr, setQrActive } from '@/server/events';

export const dynamic = 'force-dynamic';

export const GET = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req);
  const { id } = await params;
  const ev = await loadEventFor(u, id, 'view');
  const qr = await prisma.eventQr.findUnique({ where: { eventId: id } });
  if (!qr) throw Errors.notFound('QR');
  const url = registrationUrl(env.appUrl, qr.token);
  const format = req.nextUrl.searchParams.get('format') ?? 'png';
  const inline = req.nextUrl.searchParams.get('inline') === '1';
  if (format === 'pdf') {
    const settings = await getSettings();
    const pdf = await qrPosterPdf({ url, eventName: ev.name, eventCode: ev.code, dateText: `${fmtEventDateLong(ev.date)} · ${ev.startTime} a ${ev.endTime}`, location: ev.location, companyName: settings.companyName, logo: await loadLogo() });
    return fileResponse(pdf, `QR_${ev.code}.pdf`, 'application/pdf', inline);
  }
  return fileResponse(await qrPng(url, 1000), `QR_${ev.code}.png`, 'image/png', inline);
});

const schema = z.object({ action: z.enum(['activate', 'deactivate', 'rotate']) });
export const POST = api<Ctx>(async (req, { params }) => {
  const u = await requireApiUser(req, ['ADMIN', 'ORGANIZER']);
  const { id } = await params;
  const { action } = await parseJson(req, schema);
  const actor = actorFrom(req, u);
  const qr = action === 'rotate' ? await rotateQr(u, id, actor) : await setQrActive(u, id, action === 'activate', actor);
  return json({ active: qr.active, url: registrationUrl(env.appUrl, qr.token) });
});
