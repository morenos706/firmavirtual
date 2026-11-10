import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { eventScope } from '@/lib/permissions';

export async function dashboardStats(user: SessionUser) {
  const scope = eventScope(user);
  const evWhere = scope;
  const relWhere = user.role === 'ADMIN' ? {} : { event: scope };
  const [byStatus, attendees, signed, emailByStatus, recent] = await Promise.all([
    prisma.event.groupBy({ by: ['status'], where: evWhere, _count: true }),
    prisma.attendanceRecord.count({ where: { ...relWhere, status: { not: 'VOIDED' } } }),
    prisma.attendanceRecord.count({ where: { ...relWhere, status: 'COMPLETED' } }),
    prisma.emailJob.groupBy({ by: ['status'], where: relWhere, _count: true }),
    prisma.auditLog.findMany({
      where: user.role === 'ADMIN' ? {} : { event: scope },
      orderBy: { id: 'desc' },
      take: 12,
      include: { event: { select: { name: true, code: true, id: true } } },
    }),
  ]);
  const st = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const em = (s: string[]) => emailByStatus.filter((b) => s.includes(b.status)).reduce((a, b) => a + b._count, 0);
  return {
    totalEvents: byStatus.reduce((a, b) => a + b._count, 0),
    active: st('ACTIVE'),
    scheduled: st('SCHEDULED'),
    finalized: st('FINALIZED'),
    drafts: st('DRAFT'),
    attendees,
    signed,
    emailsSent: em(['SENT_TO_PROVIDER', 'DELIVERED']),
    emailsPending: em(['PENDING', 'RETRYING']),
    emailsFailed: em(['FAILED', 'REJECTED']),
    recent: recent.map((r) => ({
      id: r.id.toString(),
      createdAt: r.createdAt.toISOString(),
      action: r.action,
      actor: r.actorLabel ?? r.actorType,
      event: r.event ? { id: r.event.id, name: r.event.name, code: r.event.code } : null,
    })),
  };
}
