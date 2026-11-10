import { api, json } from '@/lib/http';
import { requireApiUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const GET = api(async (req) => json({ user: await requireApiUser(req) }));
