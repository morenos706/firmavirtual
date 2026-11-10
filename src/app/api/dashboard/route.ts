import { api, json } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';
import { dashboardStats } from '@/server/dashboard';

export const dynamic = 'force-dynamic';
export const GET = api(async (req) => json(await dashboardStats(await requireApiUser(req))));
