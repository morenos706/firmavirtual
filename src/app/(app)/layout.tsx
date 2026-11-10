import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const s = await getSettings();
  return (
    <AppShell user={user} companyName={s.companyName} hasLogo={Boolean(s.logoPath)}>
      {children}
    </AppShell>
  );
}
