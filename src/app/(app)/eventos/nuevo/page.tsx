import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { EventForm } from '@/components/event-form';
import { PageHeader } from '@/components/app-shell';

export const metadata = { title: 'Nuevo evento' };
export default async function NewEventPage() {
  const user = (await getCurrentUser()) ?? redirect('/login');
  return (
    <>
      <PageHeader title="Crear nuevo evento" subtitle="La información diligenciada se usará para llenar automáticamente la planilla oficial de asistencia." />
      <EventForm isAdmin={user.role === 'ADMIN'} />
    </>
  );
}
