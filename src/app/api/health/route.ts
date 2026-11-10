import { prisma } from '@/lib/db';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch {
    return json({ status: 'error', db: 'unreachable' }, 503);
  }
}
