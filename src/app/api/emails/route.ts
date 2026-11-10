import { api, json } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { processEmailQueue } from '@/server/email/queue';

export const dynamic = 'force-dynamic';
export const GET = api(async (req) => {
  await requireApiUser(req, ['ADMIN']);
  const status = req.nextUrl.searchParams.get('status');
  const jobs = await prisma.emailJob.findMany({
    where: status ? { status: status as never } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { event: { select: { code: true, name: true, id: true } } },
  });
  return json({ jobs });
});
/** Procesa la cola manualmente (útil cuando no hay worker dedicado). */
export const POST = api(async (req) => {
  await requireApiUser(req, ['ADMIN']);
  return json({ processed: await processEmailQueue({ maxBatches: 5 }) });
});
