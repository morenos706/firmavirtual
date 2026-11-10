import { z } from 'zod';
import { api, actorFrom, json, parseJson } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const GET = api(async (req) => {
  await requireApiUser(req, ['ADMIN']);
  return json({ settings: await getSettings() });
});

const schema = z.object({
  companyName: z.string().trim().min(2).max(150),
  companyNit: z.string().trim().max(30).optional().nullable(),
  formatCode: z.string().trim().min(1).max(40),
  formatVersion: z.string().trim().min(1).max(20),
  sheetTitle: z.string().trim().min(3).max(80),
  sheetShowSignature: z.boolean(),
  receiptFooterNote: z.string().trim().max(500).optional().nullable(),
  supportEmail: z.string().trim().email().max(200).optional().nullable().or(z.literal('')),
});
export const PUT = api(async (req) => {
  const u = await requireApiUser(req, ['ADMIN']);
  const input = await parseJson(req, schema);
  const before = await getSettings();
  const s = await prisma.appSettings.update({ where: { id: 1 }, data: { ...input, supportEmail: input.supportEmail || null } });
  const changes = Object.fromEntries(Object.entries(input).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v).map(([k, v]) => [k, { from: (before as Record<string, unknown>)[k], to: v }]));
  await audit(actorFrom(req, u), { action: 'SETTINGS_UPDATED', entityType: 'settings', entityId: '1', details: changes });
  return json({ settings: s });
});
