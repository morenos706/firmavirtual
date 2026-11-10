import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/permissions';
import { EventForm } from '@/components/event-form';
import { PageHeader } from '@/components/app-shell';

export const metadata = { title: 'Editar evento' };
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getCurrentUser()) ?? redirect('/login');
  const { id } = await params;
  const ev = await prisma.event.findUnique({ where: { id }, include: { fields: { orderBy: { order: 'asc' } } } });
  if (!ev || !can.manageEvent(user, ev)) notFound();
  if (ev.status === 'CANCELLED' || (ev.status === 'FINALIZED' && user.role !== 'ADMIN')) redirect(`/eventos/${id}`);
  return (
    <>
      <PageHeader title={`Editar ${ev.code}`} subtitle={ev.name} />
      <EventForm
        eventId={ev.id}
        status={ev.status}
        isAdmin={user.role === 'ADMIN'}
        initial={{
          program: ev.program, topic: ev.topic, relatedDocument: ev.relatedDocument ?? '', name: ev.name, description: ev.description ?? '',
          trainer: ev.trainer, institution: ev.institution, classification: ev.classification, date: ev.date.toISOString().slice(0, 10),
          startTime: ev.startTime, endTime: ev.endTime, durationHours: String(ev.durationHours.toNumber()), location: ev.location,
          organizerId: ev.organizerId, otpChannel: ev.otpChannel, requireDataConsent: ev.requireDataConsent, duplicateRule: ev.duplicateRule,
          fields: ev.fields.map((f) => ({ key: f.key, label: f.label, enabled: f.enabled, required: f.required, order: f.order })),
        }}
      />
    </>
  );
}
