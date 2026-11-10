'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Mail, Play } from 'lucide-react';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { apiFetch, errorMessage, fmtDate } from '@/lib/client';

const L: Record<string, string> = { PENDING: 'Pendiente', RETRYING: 'Reintentando', SENT_TO_PROVIDER: 'Enviado al proveedor', DELIVERED: 'Entregado', REJECTED: 'Rechazado', FAILED: 'Fallido', CANCELLED: 'Cancelado' };
type Job = { id: string; recipient: string; subject: string; status: string; attempts: number; maxAttempts: number; lastError: string | null; sentAt: string | null; nextAttemptAt: string; createdAt: string; isManualResend: boolean; event: { id: string; code: string } };

export default function EmailsPage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiFetch<{ jobs: Job[] }>(`/api/emails${status ? `?status=${status}` : ''}`).then((r) => setJobs(r.jobs)), [status]);
  useEffect(() => { load(); const t = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(t); }, [load]);
  const run = async () => {
    setBusy(true);
    try {
      const r = await apiFetch<{ processed: number }>('/api/emails', { method: 'POST' });
      toast('success', `${r.processed} trabajo(s) procesados.`);
      await load();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Cola de correos" subtitle="Historial y estado de los comprobantes enviados." actions={<Button variant="navy" loading={busy} onClick={run}><Play className="h-4 w-4" /> Procesar cola ahora</Button>} />
      <div className="mb-4 flex flex-wrap gap-1">
        {['', ...Object.keys(L)].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? 'bg-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-200'}`}>{s ? L[s] : 'Todos'}</button>
        ))}
      </div>
      <Card title="Trabajos de envío" icon={<Mail className="h-4 w-4" />}>
        {!jobs ? <Spinner /> : (
          <div className="-m-5 overflow-x-auto">
            <table className="table-pro">
              <thead><tr><th>Destinatario</th><th>Evento</th><th>Estado</th><th className="text-center">Intentos</th><th>Enviado / próximo intento</th><th>Error</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="text-sm">{j.recipient}{j.isManualResend && <span className="ml-1 text-xs text-slate-500">(reenvío)</span>}</td>
                    <td><Link className="text-xs font-semibold text-brand" href={`/eventos/${j.event.id}`}>{j.event.code}</Link></td>
                    <td><Badge status={j.status}>{L[j.status]}</Badge></td>
                    <td className="text-center text-sm">{j.attempts}/{j.maxAttempts}</td>
                    <td className="whitespace-nowrap text-xs">{j.sentAt ? fmtDate(j.sentAt) : ['PENDING', 'RETRYING'].includes(j.status) ? `Próximo: ${fmtDate(j.nextAttemptAt)}` : '—'}</td>
                    <td className="max-w-[260px] truncate text-xs text-red-600" title={j.lastError ?? ''}>{j.lastError}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">Sin trabajos.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
