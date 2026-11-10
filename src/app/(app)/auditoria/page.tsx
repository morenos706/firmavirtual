'use client';
import { useCallback, useEffect, useState } from 'react';
import { ScrollText, ShieldCheck } from 'lucide-react';
import { Button, Card, Modal, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { apiFetch, errorMessage, fmtDate } from '@/lib/client';

type Row = { id: string; createdAt: string; actorType: string; actorLabel: string | null; action: string; entityType: string; entityId: string | null; ip: string | null; details: unknown; hash: string; event: { code: string; name: string } | null };

export default function AuditPage() {
  const toast = useToast();
  const [data, setData] = useState<{ rows: Row[]; total: number; page: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [verifying, setVerifying] = useState(false);
  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (action) p.set('action', action);
    apiFetch<typeof data>(`/api/audit?${p}`).then(setData).catch((e) => toast('error', errorMessage(e)));
  }, [page, action, toast]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const verify = async () => {
    setVerifying(true);
    try {
      const r = await apiFetch<{ ok: boolean; checked: number; brokenAt?: string }>('/api/audit?verify=1');
      toast(r.ok ? 'success' : 'error', r.ok ? `Cadena íntegra: ${r.checked} registros verificados.` : `¡Alerta! La cadena se rompe en el registro #${r.brokenAt}.`);
    } finally {
      setVerifying(false);
    }
  };
  return (
    <>
      <PageHeader title="Auditoría" subtitle="Bitácora inalterable (encadenada por SHA-256 y protegida contra modificación en la base de datos)." actions={<Button variant="navy" loading={verifying} onClick={verify}><ShieldCheck className="h-4 w-4" /> Verificar integridad</Button>} />
      <Card title="Registros" icon={<ScrollText className="h-4 w-4" />} actions={<input className="input w-56" placeholder="Filtrar por acción (p. ej. EVENT)" value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} />}>
        {!data ? <Spinner /> : (
          <>
            <div className="-mx-5 overflow-x-auto">
              <table className="table-pro">
                <thead><tr><th>#</th><th>Fecha</th><th>Actor</th><th>Acción</th><th className="hidden md:table-cell">Evento</th><th className="hidden lg:table-cell">IP</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer">
                      <td className="text-xs text-slate-500">{r.id}</td>
                      <td className="whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td>
                      <td className="text-xs">{r.actorLabel ?? r.actorType}</td>
                      <td className="font-mono text-xs font-semibold">{r.action}</td>
                      <td className="hidden text-xs md:table-cell">{r.event?.code ?? '—'}</td>
                      <td className="hidden font-mono text-xs lg:table-cell">{r.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">{data.total} registros</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                <Button size="sm" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Siguiente</Button>
              </div>
            </div>
          </>
        )}
      </Card>
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`Registro #${detail?.id}`} wide>
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-navy p-4 text-[11px] text-slate-100">{JSON.stringify(detail, null, 2)}</pre>
      </Modal>
    </>
  );
}
