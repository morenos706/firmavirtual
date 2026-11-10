import type { Prisma } from '@prisma/client';
import { api, json } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifyAuditChain } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const GET = api(async (req) => {
  await requireApiUser(req, ['ADMIN']);
  const sp = req.nextUrl.searchParams;
  if (sp.get('verify') === '1') return json(await verifyAuditChain());
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.get('eventId') ? { eventId: sp.get('eventId')! } : {}),
    ...(sp.get('action') ? { action: { contains: sp.get('action')!.toUpperCase() } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * 50, take: 50, include: { event: { select: { code: true, name: true } } } }),
  ]);
  return json({ total, page, pageSize: 50, rows: rows.map((r) => ({ ...r, id: r.id.toString() })) });
});
