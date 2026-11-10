import Link from 'next/link';
import { Activity, CalendarCheck2, CalendarClock, CalendarDays, CheckCircle2, MailCheck, MailWarning, MailX, PenLine, Plus, Users } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { dashboardStats } from '@/server/dashboard';
import { StatCard } from '@/components/ui';
import { PageHeader } from '@/components/app-shell';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

const ACTIONS: Record<string, string> = {
  EVENT_CREATED: 'creó el evento',
  EVENT_UPDATED: 'editó el evento',
  EVENT_STATUS_CHANGED: 'cambió el estado del evento',
  EVENT_CLOSED: 'cerró el evento',
  EVENT_CLOSING_COMPLETED: 'completó el cierre de',
  ATTENDANCE_SIGNED: 'firmó su asistencia en',
  REGISTRATION_STARTED: 'inició su registro en',
  OTP_VERIFIED: 'verificó su identidad en',
  CONSENT_ACCEPTED: 'aceptó el acuerdo en',
  QR_ACTIVATED: 'activó el QR de',
  QR_DEACTIVATED: 'desactivó el QR de',
  LOGIN_SUCCESS: 'inició sesión',
  EMAIL_RESEND_REQUESTED: 'solicitó reenvío de comprobante en',
};

export default async function DashboardPage() {
  const user = (await getCurrentUser()) ?? redirect('/login');
  const s = await dashboardStats(user);
  return (
    <>
      <PageHeader
        title={`Hola, ${user.name.split(' ')[0]}`}
        subtitle={user.role === 'ADMIN' ? 'Resumen general de la plataforma' : 'Resumen de sus eventos'}
        actions={
          <Link href="/eventos/nuevo" className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-brand/30 transition hover:bg-brand-700">
            <Plus className="h-5 w-5" /> Crear nuevo evento
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total de eventos" value={s.totalEvents} icon={<CalendarDays className="h-5 w-5" />} tone="navy" hint={`${s.drafts} en borrador`} />
        <StatCard label="Eventos activos" value={s.active} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Eventos programados" value={s.scheduled} icon={<CalendarClock className="h-5 w-5" />} tone="sky" />
        <StatCard label="Eventos finalizados" value={s.finalized} icon={<CalendarCheck2 className="h-5 w-5" />} tone="navy" />
        <StatCard label="Total de asistentes" value={s.attendees} icon={<Users className="h-5 w-5" />} tone="sky" hint="Registros iniciados" />
        <StatCard label="Firmas completadas" value={s.signed} icon={<PenLine className="h-5 w-5" />} />
        <StatCard label="Comprobantes enviados" value={s.emailsSent} icon={<MailCheck className="h-5 w-5" />} hint="Aceptados por el proveedor" />
        <StatCard label="Correos pendientes" value={s.emailsPending} icon={<MailWarning className="h-5 w-5" />} tone="amber" hint="En cola o reintentando" />
        <StatCard label="Correos fallidos" value={s.emailsFailed} icon={<MailX className="h-5 w-5" />} tone="red" hint="Fallidos o rechazados" />
      </div>

      <section className="card mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
            <CheckCircle2 className="h-4 w-4 text-brand" /> Actividad reciente
          </h2>
        </div>
        {s.recent.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Aún no hay actividad registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {s.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="text-navy">
                  <span className="font-semibold">{r.actor}</span> {ACTIONS[r.action] ?? r.action.toLowerCase().replaceAll('_', ' ')}{' '}
                  {r.event && (
                    <Link href={`/eventos/${r.event.id}`} className="font-medium text-brand hover:underline">
                      {r.event.name}
                    </Link>
                  )}
                </span>
                <span className="text-xs text-slate-500">{fmtDateTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
