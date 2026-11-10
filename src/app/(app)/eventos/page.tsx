'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Plus, Search } from 'lucide-react';
import { Badge, Empty, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/app-shell';
import { apiFetch, fmtDay } from '@/lib/client';

type Ev = { id: string; code: string; name: string; topic: string; date: string; startTime: string; endTime: string; location: string; status: string; organizer: string; signed: number };
const LABELS: Record<string, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', ACTIVE: 'Activo', FINALIZED: 'Finalizado', CANCELLED: 'Cancelado' };

export default function EventsPage() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (q) p.set('q', q);
      apiFetch<{ events: Ev[] }>(`/api/events?${p}`).then((r) => setEvents(r.events)).catch(() => setEvents([]));
    }, 250);
    return () => clearTimeout(t);
  }, [status, q]);
  return (
    <>
      <PageHeader title="Eventos" subtitle="Gestione eventos, códigos QR, asistentes y planillas." actions={<Link href="/eventos/nuevo" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Crear nuevo evento</Link>} />
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por nombre, código o tema" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {['', 'DRAFT', 'SCHEDULED', 'ACTIVE', 'FINALIZED', 'CANCELLED'].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? 'bg-navy text-white' : 'bg-mist text-slate-600 hover:bg-slate-200'}`}>{s ? LABELS[s] : 'Todos'}</button>
          ))}
        </div>
      </div>
      <div className="card overflow-hidden">
        {!events ? <Spinner /> : events.length === 0 ? (
          <Empty icon={<CalendarDays className="h-6 w-6" />} title="No hay eventos" text="Cree su primer evento para generar el código QR de registro." action={<Link href="/eventos/nuevo" className="text-sm font-semibold text-brand">Crear evento →</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-pro">
              <thead><tr><th>Evento</th><th>Fecha</th><th className="hidden md:table-cell">Lugar</th><th className="hidden lg:table-cell">Organizador</th><th className="text-center">Firmas</th><th>Estado</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="cursor-pointer">
                    <td>
                      <Link href={`/eventos/${e.id}`} className="block">
                        <span className="font-semibold text-navy hover:text-brand">{e.name}</span>
                        <span className="block text-xs text-slate-500">{e.code} · {e.topic}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{fmtDay(e.date)}<span className="block text-xs text-slate-500">{e.startTime}–{e.endTime}</span></td>
                    <td className="hidden md:table-cell"><span className="inline-flex items-center gap-1 text-slate-600"><MapPin className="h-3.5 w-3.5" />{e.location}</span></td>
                    <td className="hidden lg:table-cell text-slate-600">{e.organizer}</td>
                    <td className="text-center font-semibold">{e.signed}</td>
                    <td><Badge status={e.status}>{LABELS[e.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
