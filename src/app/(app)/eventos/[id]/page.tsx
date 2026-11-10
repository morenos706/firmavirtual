'use client';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart3, CalendarClock, Copy, Download, Eye, FileSpreadsheet, FileText, Lock, Mail, Pencil, PlayCircle, Power,
  Printer, QrCode, RefreshCw, RotateCcw, Send, Users, XCircle,
} from 'lucide-react';
import { Badge, Button, Card, Empty, Modal, Spinner, StatCard } from '@/components/ui';
import { useToast } from '@/components/toast';
import { apiFetch, errorMessage, fmtDate, fmtDay } from '@/lib/client';

const STATUS: Record<string, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', ACTIVE: 'Activo', FINALIZED: 'Finalizado', CANCELLED: 'Cancelado' };
const EMAIL: Record<string, string> = { PENDING: 'Pendiente', RETRYING: 'Reintentando', SENT_TO_PROVIDER: 'Enviado al proveedor', DELIVERED: 'Entregado', REJECTED: 'Rechazado', FAILED: 'Fallido', CANCELLED: 'Cancelado' };
const ATT: Record<string, string> = { STARTED: 'Registro iniciado', OTP_VERIFIED: 'Verificado, sin firma', COMPLETED: 'Firmado', VOIDED: 'Anulado' };

type Detail = {
  event: {
    id: string; code: string; name: string; program: string; topic: string; relatedDocument: string | null; description: string | null; trainer: string; institution: string;
    classification: string; date: string; startTime: string; endTime: string; durationHours: number; location: string; status: string; otpChannel: string;
    requireDataConsent: boolean; duplicateRule: string; closingStatus: string; closingError: string | null; closedAt: string | null; closedBy: { name: string } | null;
    organizer: { name: string }; qr: { active: boolean; scans: number; url: string } | null; closingReport: Record<string, unknown> | null;
  };
  counts: Record<string, number>;
  documents: { id: string; type: string; fileName: string; sha256: string; verificationCode: string; createdAt: string }[];
  permissions: { manage: boolean; admin: boolean };
};

const TABS = [
  { k: 'resumen', label: 'Resumen', icon: FileText },
  { k: 'qr', label: 'Código QR', icon: QrCode },
  { k: 'asistentes', label: 'Asistentes', icon: Users },
  { k: 'planilla', label: 'Planilla oficial', icon: FileSpreadsheet },
  { k: 'comprobantes', label: 'Comprobantes enviados', icon: Mail },
  { k: 'informe', label: 'Informe de cierre', icon: BarChart3 },
] as const;

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['k']>('resumen');
  const [busy, setBusy] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(() => apiFetch<Detail>(`/api/events/${id}`).then(setD).catch((e) => toast('error', errorMessage(e))), [id, toast]);
  useEffect(() => {
    load();
  }, [load]);

  if (!d) return <Spinner />;
  const ev = d.event;
  const closed = ev.status === 'FINALIZED' || ev.status === 'CANCELLED';
  const signed = d.counts.COMPLETED ?? 0;
  const pending = (d.counts.STARTED ?? 0) + (d.counts.OTP_VERIFIED ?? 0);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast('success', ok);
      await load();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  const setStatus = (status: string, ok: string, extra: Record<string, unknown> = {}) =>
    run(status, () => apiFetch(`/api/events/${id}/status`, { body: { status, ...extra } }), ok);
  const close = () =>
    run('close', async () => {
      setConfirmClose(false);
      await apiFetch(`/api/events/${id}/close`, { method: 'POST' });
      setTab('informe');
    }, 'Evento cerrado. Documentos definitivos generados; los comprobantes se están enviando.');

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{ev.code}</span>
            <Badge status={ev.status}>{STATUS[ev.status]}</Badge>
            {ev.qr && !closed && <Badge status={ev.qr.active ? 'ACTIVE' : 'DRAFT'}>QR {ev.qr.active ? 'activo' : 'inactivo'}</Badge>}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-navy">{ev.name}</h1>
          <p className="text-sm text-slate-500">{fmtDay(ev.date)} · {ev.startTime}–{ev.endTime} · {ev.location}</p>
        </div>
        {d.permissions.manage && (
          <div className="flex flex-wrap gap-2">
            {(!closed || (ev.status === 'FINALIZED' && d.permissions.admin)) && (
              <Link href={`/eventos/${id}/editar`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-mist">
                <Pencil className="h-4 w-4" /> {ev.status === 'FINALIZED' ? 'Corregir' : 'Editar'}
              </Link>
            )}
            {ev.status === 'DRAFT' && <Button variant="secondary" loading={busy === 'SCHEDULED'} onClick={() => setStatus('SCHEDULED', 'Evento programado.')}><CalendarClock className="h-4 w-4" /> Programar</Button>}
            {(ev.status === 'DRAFT' || ev.status === 'SCHEDULED') && <Button loading={busy === 'ACTIVE'} onClick={() => setStatus('ACTIVE', 'Registro habilitado: el QR ya recibe asistentes.')}><PlayCircle className="h-4 w-4" /> Activar registro</Button>}
            {ev.status === 'ACTIVE' && <Button variant="secondary" loading={busy === 'SCHEDULED'} onClick={() => setStatus('SCHEDULED', 'Registro pausado.')}>Pausar registro</Button>}
            {(ev.status === 'ACTIVE' || ev.status === 'SCHEDULED') && <Button variant="navy" loading={busy === 'close'} onClick={() => setConfirmClose(true)}><Lock className="h-4 w-4" /> Cerrar evento</Button>}
            {ev.status === 'FINALIZED' && ev.closingStatus !== 'COMPLETED' && <Button variant="navy" loading={busy === 'close'} onClick={close}><RefreshCw className="h-4 w-4" /> Reanudar cierre</Button>}
            {!closed && <Button variant="ghost" onClick={() => setConfirmCancel(true)} className="text-red-600"><XCircle className="h-4 w-4" /> Cancelar</Button>}
          </div>
        )}
      </div>

      {ev.closingStatus === 'FAILED' && (
        <div className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" /> El cierre no terminó: {ev.closingError}. Use «Reanudar cierre»: no se generarán documentos ni correos duplicados.
        </div>
      )}

      <div className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.k ? 'bg-brand text-white' : 'text-slate-600 hover:bg-mist'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Datos del evento" className="lg:col-span-2">
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              {[
                ['Programa', ev.program], ['Tema', ev.topic], ['Documento relacionado', ev.relatedDocument ?? '—'], ['Formador', ev.trainer],
                ['Institución', ev.institution], ['Clasificación', ev.classification === 'INTERNAL' ? 'Interno' : 'Externo'],
                ['Fecha', fmtDay(ev.date)], ['Horario', `${ev.startTime} a ${ev.endTime} (${ev.durationHours} h)`], ['Lugar', ev.location],
                ['Organizador responsable', ev.organizer.name], ['Verificación OTP', ev.otpChannel === 'SMS' ? 'SMS' : 'Correo electrónico'],
                ['Duplicados', ev.duplicateRule === 'DOCUMENT' ? 'Por identificación' : 'Por identificación y correo'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
                  <dd className="mt-0.5 text-navy">{v}</dd>
                </div>
              ))}
              {ev.description && <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Descripción</dt><dd className="mt-0.5 whitespace-pre-line text-navy">{ev.description}</dd></div>}
            </dl>
          </Card>
          <div className="space-y-4">
            <StatCard label="Firmas completadas" value={signed} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Registros sin finalizar" value={pending} icon={<RotateCcw className="h-5 w-5" />} tone="amber" hint="No reciben comprobante" />
            <StatCard label="Escaneos del QR" value={ev.qr?.scans ?? 0} icon={<QrCode className="h-5 w-5" />} tone="sky" />
            {ev.closedAt && <Card title="Cierre"><p className="text-sm">Cerrado el {fmtDate(ev.closedAt)}{ev.closedBy ? ` por ${ev.closedBy.name}` : ''}.</p></Card>}
          </div>
        </div>
      )}

      {tab === 'qr' && ev.qr && <QrTab id={id} qr={ev.qr} closed={closed} manage={d.permissions.manage} reload={load} />}
      {tab === 'asistentes' && <AttendeesTab id={id} />}
      {tab === 'planilla' && <SheetTab id={id} final={d.documents.find((x) => x.type === 'ATTENDANCE_SHEET')} status={ev.status} />}
      {tab === 'comprobantes' && <ReceiptsTab id={id} finalized={ev.status === 'FINALIZED'} />}
      {tab === 'informe' && <ReportTab id={id} finalized={ev.status === 'FINALIZED'} documents={d.documents} />}

      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="¿Cerrar el evento?"
        footer={<><Button variant="secondary" onClick={() => setConfirmClose(false)}>Volver</Button><Button variant="navy" onClick={close}><Lock className="h-4 w-4" /> Sí, cerrar evento</Button></>}
      >
        <div className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Esta acción no se puede deshacer.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>El evento pasará a <strong>FINALIZADO</strong> y se bloquearán nuevos registros.</li>
              <li>Se generarán la planilla oficial definitiva y un comprobante PDF por participante, con sus huellas SHA-256.</li>
              <li>Se enviará el comprobante por correo a las <strong>{signed}</strong> personas con firma completa.</li>
              {pending > 0 && <li><strong>{pending}</strong> registro(s) sin firma no recibirán comprobante.</li>}
              <li>Los datos de evidencia del evento quedarán bloqueados para modificaciones.</li>
            </ul>
          </div>
        </div>
      </Modal>
      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancelar evento"
        footer={<><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Volver</Button><Button variant="danger" loading={busy === 'CANCELLED'} onClick={() => { setConfirmCancel(false); setStatus('CANCELLED', 'Evento cancelado.', { reason }); }}>Cancelar evento</Button></>}
      >
        <p className="mb-3 text-sm text-slate-600">El QR dejará de admitir registros. {signed > 0 && 'Este evento tiene firmas registradas: indique la justificación.'}</p>
        <textarea className="input min-h-[80px]" placeholder="Motivo de la cancelación" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}

function QrTab({ id, qr, closed, manage, reload }: { id: string; qr: { active: boolean; url: string; scans: number }; closed: boolean; manage: boolean; reload: () => Promise<unknown> }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [v, setV] = useState(0);
  const act = async (action: 'activate' | 'deactivate' | 'rotate') => {
    if (action === 'rotate' && !confirm('Se generará un nuevo identificador y los QR impresos anteriormente dejarán de funcionar. ¿Continuar?')) return;
    setBusy(action);
    try {
      await apiFetch(`/api/events/${id}/qr`, { body: { action } });
      toast('success', action === 'rotate' ? 'Nuevo QR generado.' : action === 'activate' ? 'QR activado.' : 'QR desactivado.');
      setV((x) => x + 1);
      await reload();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <Card>
        <div className={`relative rounded-xl border-4 p-3 ${qr.active && !closed ? 'border-brand' : 'border-slate-300'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/events/${id}/qr?format=png&inline=1&v=${v}`} alt="Código QR del evento" className={`w-full ${qr.active && !closed ? '' : 'opacity-30 grayscale'}`} />
          {(!qr.active || closed) && <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-navy">{closed ? 'EVENTO CERRADO' : 'QR DESACTIVADO'}</span>}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">El QR solo contiene un identificador aleatorio; no incluye datos personales.</p>
      </Card>
      <Card title="Enlace y descargas">
        <label className="label">Enlace del formulario público</label>
        <div className="flex gap-2">
          <input readOnly className="input font-mono text-xs" value={qr.url} />
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(qr.url).then(() => toast('success', 'Enlace copiado.'))}><Copy className="h-4 w-4" /></Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`/api/events/${id}/qr?format=png`} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Download className="h-4 w-4" /> PNG</a>
          <a href={`/api/events/${id}/qr?format=pdf`} className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"><Download className="h-4 w-4" /> PDF</a>
          <a href={`/api/events/${id}/qr?format=pdf&inline=1`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:bg-mist"><Printer className="h-4 w-4" /> Imprimir</a>
        </div>
        {manage && !closed && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {qr.active ? (
              <Button variant="secondary" loading={busy === 'deactivate'} onClick={() => act('deactivate')}><Power className="h-4 w-4" /> Desactivar QR</Button>
            ) : (
              <Button loading={busy === 'activate'} onClick={() => act('activate')}><Power className="h-4 w-4" /> Activar QR</Button>
            )}
            <Button variant="ghost" loading={busy === 'rotate'} onClick={() => act('rotate')}><RefreshCw className="h-4 w-4" /> Regenerar identificador</Button>
          </div>
        )}
        <p className="mt-4 text-sm text-slate-500">Escaneos registrados: <strong>{qr.scans}</strong>. El formulario solo admite registros cuando el evento está <strong>Activo</strong> y el QR habilitado.</p>
      </Card>
    </div>
  );
}

type Att = { id: string; sequence: number | null; status: string; evidenceCode: string; documentNumber: string; fullName: string; company: string | null; management: string | null; area: string | null; email: string; authMethod: string | null; completedAt: string | null; startedAt: string; hasSignature: boolean; evidenceHash: string | null };

function AttendeesTab({ id }: { id: string }) {
  const [data, setData] = useState<{ attendees: Att[]; canViewSignatures: boolean } | null>(null);
  const [sig, setSig] = useState<Att | null>(null);
  const [evidence, setEvidence] = useState<unknown>(null);
  useEffect(() => {
    apiFetch<{ attendees: Att[]; canViewSignatures: boolean }>(`/api/events/${id}/attendees`).then(setData);
    const t = setInterval(() => apiFetch<{ attendees: Att[]; canViewSignatures: boolean }>(`/api/events/${id}/attendees`).then(setData).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [id]);
  if (!data) return <Spinner />;
  return (
    <Card title={`Asistentes (${data.attendees.filter((a) => a.status === 'COMPLETED').length} firmados)`} actions={<a href={`/api/events/${id}/export`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-mist"><FileSpreadsheet className="h-4 w-4" /> Excel</a>}>
      {data.attendees.length === 0 ? <Empty icon={<Users className="h-6 w-6" />} title="Sin registros todavía" text="Los participantes aparecerán aquí a medida que escaneen el QR y firmen." /> : (
        <div className="-m-5 overflow-x-auto">
          <table className="table-pro">
            <thead><tr><th>#</th><th>Cédula</th><th>Nombre y apellidos</th><th className="hidden md:table-cell">Empresa / Gerencia / Área</th><th className="hidden lg:table-cell">Correo</th><th>Estado</th><th className="hidden md:table-cell">Firma</th>{data.canViewSignatures && <th></th>}</tr></thead>
            <tbody>
              {data.attendees.map((a, i) => (
                <tr key={a.id}>
                  <td className="text-slate-500">{a.sequence ?? (a.status === 'COMPLETED' ? i + 1 : '—')}</td>
                  <td className="font-mono text-xs">{a.documentNumber}</td>
                  <td><span className="font-semibold">{a.fullName}</span><span className="block font-mono text-[11px] text-brand">{a.evidenceCode}</span></td>
                  <td className="hidden text-xs text-slate-600 md:table-cell">{[a.company, a.management, a.area].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="hidden text-xs lg:table-cell">{a.email}</td>
                  <td><Badge status={a.status}>{ATT[a.status]}</Badge></td>
                  <td className="hidden whitespace-nowrap text-xs md:table-cell">{a.completedAt ? fmtDate(a.completedAt) : '—'}</td>
                  {data.canViewSignatures && (
                    <td className="whitespace-nowrap text-right">
                      {a.hasSignature && <Button size="sm" variant="ghost" onClick={() => setSig(a)} title="Ver firma"><Eye className="h-4 w-4" /></Button>}
                      <Button size="sm" variant="ghost" onClick={() => apiFetch<{ record: unknown }>(`/api/records/${a.id}/evidence`).then((r) => setEvidence(r.record))} title="Expediente"><FileText className="h-4 w-4" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={Boolean(sig)} onClose={() => setSig(null)} title={`Firma — ${sig?.fullName ?? ''}`}>
        {sig && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/records/${sig.id}/signature`} alt="Firma manuscrita" className="w-full rounded-lg border border-slate-200 bg-white" />
            <p className="mt-3 text-xs text-slate-500">La imagen de la firma es una de las evidencias del expediente. Por sí sola no garantiza la identidad del firmante: se complementa con la autenticación OTP, la aceptación del acuerdo y la trazabilidad registrada.</p>
            <p className="mt-2 break-all font-mono text-[11px] text-slate-500">Huella del expediente: {sig.evidenceHash}</p>
          </>
        )}
      </Modal>
      <Modal open={Boolean(evidence)} onClose={() => setEvidence(null)} title="Expediente digital de evidencia" wide>
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-navy p-4 text-[11px] leading-relaxed text-slate-100">{JSON.stringify(evidence, null, 2)}</pre>
      </Modal>
    </Card>
  );
}

function SheetTab({ id, final, status }: { id: string; final?: { sha256: string; verificationCode: string; createdAt: string }; status: string }) {
  return (
    <div className="space-y-4">
      <Card
        title={final ? 'Planilla oficial — versión definitiva' : 'Planilla oficial — vista previa'}
        actions={
          <>
            <a href={`/api/events/${id}/sheet`} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"><Download className="h-4 w-4" /> PDF</a>
            <a href={`/api/events/${id}/export`} className="inline-flex items-center gap-2 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white"><FileSpreadsheet className="h-4 w-4" /> Excel</a>
            <a href={`/api/events/${id}/sheet?inline=1`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-mist"><Printer className="h-4 w-4" /> Imprimir</a>
          </>
        }
      >
        {final ? (
          <p className="mb-3 text-sm text-slate-600">Versión conservada al cierre ({fmtDate(final.createdAt)}). Código de verificación <strong className="font-mono">{final.verificationCode}</strong> · SHA-256 <span className="break-all font-mono text-xs">{final.sha256}</span></p>
        ) : (
          <p className="mb-3 text-sm text-slate-600">{status === 'CANCELLED' ? 'Evento cancelado.' : 'Vista previa con los registros firmados hasta el momento. La versión definitiva se genera y conserva al cerrar el evento.'}</p>
        )}
        <iframe src={`/api/events/${id}/sheet?inline=1`} title="Planilla oficial" className="h-[75vh] w-full rounded-lg border border-slate-200 bg-mist" />
      </Card>
    </div>
  );
}

type Receipt = { recordId: string; sequence: number | null; evidenceCode: string; participant: string; email: string; signedAt: string; document: { id: string; fileName: string; sha256: string } | null; emailStatus: string | null; sentAt: string | null; deliveredAt: string | null; attempts: number; error: string | null; history: { at: string; status: string; error: string | null; manual: boolean }[] };

function ReceiptsTab({ id, finalized }: { id: string; finalized: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<{ items: Receipt[]; canResend: boolean; canDownload: boolean } | null>(null);
  const [resend, setResend] = useState<Receipt | null>(null);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<Receipt | null>(null);
  const load = useCallback(() => apiFetch<{ items: Receipt[]; canResend: boolean; canDownload: boolean }>(`/api/events/${id}/receipts`).then(setData), [id]);
  useEffect(() => {
    load();
    const t = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [load]);
  if (!data) return <Spinner />;
  const doResend = async () => {
    if (!resend) return;
    setBusy(true);
    try {
      await apiFetch(`/api/records/${resend.recordId}/resend`, { body: { recipient: recipient && recipient !== resend.email ? recipient : null } });
      toast('success', 'Reenvío en cola.');
      setResend(null);
      await load();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="Comprobantes enviados"
      actions={data.canDownload && finalized && data.items.length > 0 ? <a href={`/api/events/${id}/receipts?download=zip`} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"><Download className="h-4 w-4" /> Descargar todos (ZIP)</a> : null}
    >
      {!finalized && <p className="mb-4 rounded-lg bg-mist p-3 text-sm text-slate-600">Los comprobantes se generan y envían automáticamente al cerrar el evento.</p>}
      <p className="mb-3 text-xs text-slate-500">«Enviado al proveedor» significa que el proveedor de correo aceptó el mensaje; solo se marca «Entregado» cuando el proveedor confirma la entrega.</p>
      {data.items.length === 0 ? <Empty icon={<Mail className="h-6 w-6" />} title="Sin comprobantes" /> : (
        <div className="-mx-5 overflow-x-auto">
          <table className="table-pro">
            <thead><tr><th>Participante</th><th>Correo</th><th className="hidden md:table-cell">Fecha de firma</th><th>Documento</th><th>Estado del correo</th><th className="hidden md:table-cell">Fecha de envío</th><th className="text-center">Intentos</th><th>Error</th><th></th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.recordId}>
                  <td><span className="font-semibold">{r.participant}</span><span className="block whitespace-nowrap font-mono text-[11px] text-slate-500">{r.evidenceCode}</span></td>
                  <td className="text-xs">{r.email}</td>
                  <td className="hidden whitespace-nowrap text-xs md:table-cell">{fmtDate(r.signedAt)}</td>
                  <td className="text-xs">{r.document ? <span className="text-brand-800">Generado</span> : <span className="text-slate-400">Pendiente</span>}</td>
                  <td>{r.emailStatus ? <button onClick={() => setHist(r)}><Badge status={r.emailStatus}>{EMAIL[r.emailStatus]}</Badge></button> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="hidden whitespace-nowrap text-xs md:table-cell">{fmtDate(r.deliveredAt ?? r.sentAt)}</td>
                  <td className="text-center">{r.attempts}</td>
                  <td className="max-w-[200px] truncate text-xs text-red-600" title={r.error ?? ''}>{r.error ?? ''}</td>
                  <td className="whitespace-nowrap text-right">
                    {data.canDownload && r.document && <a href={`/api/documents/${r.document.id}`} className="inline-flex rounded p-1.5 text-navy hover:bg-mist" title="Descargar"><Download className="h-4 w-4" /></a>}
                    {data.canResend && r.document && <button onClick={() => { setResend(r); setRecipient(r.email); }} className="inline-flex rounded p-1.5 text-brand hover:bg-mist" title="Reenviar"><Send className="h-4 w-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={Boolean(resend)} onClose={() => setResend(null)} title="Reenviar comprobante" footer={<><Button variant="secondary" onClick={() => setResend(null)}>Cancelar</Button><Button loading={busy} onClick={doResend}><Send className="h-4 w-4" /> Reenviar</Button></>}>
        <p className="mb-3 text-sm text-slate-600">Se creará un nuevo envío para <strong>{resend?.participant}</strong>. El historial anterior se conserva.</p>
        <label className="label">Correo de destino</label>
        <input className="input" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
      </Modal>
      <Modal open={Boolean(hist)} onClose={() => setHist(null)} title={`Historial de envíos — ${hist?.participant ?? ''}`}>
        <ol className="space-y-2 text-sm">
          {hist?.history.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
              <span className="text-xs text-slate-500">{fmtDate(h.at)}</span>
              <Badge status={h.status}>{EMAIL[h.status] ?? h.status}</Badge>
              {h.manual && <span className="text-xs text-slate-500">(reenvío manual)</span>}
              {h.error && <span className="w-full text-xs text-red-600">{h.error}</span>}
            </li>
          ))}
          {hist?.history.length === 0 && <li className="text-slate-500">Aún sin intentos de envío.</li>}
        </ol>
      </Modal>
    </Card>
  );
}

type Metrics = { registered: number; signed: number; valid: number; sheets: number; receipts: number; emailsSent: number; emailsDelivered: number; emailsPending: number; emailsFailed: number };

function ReportTab({ id, finalized, documents }: { id: string; finalized: boolean; documents: Detail['documents'] }) {
  const [r, setR] = useState<{ metrics: Metrics; snapshot: (Metrics & { inconsistencies: { evidenceCode: string; problem: string }[]; incompleteRegistrations: number; closedAt: string }) | null } | null>(null);
  useEffect(() => {
    const load = () => apiFetch<typeof r>(`/api/events/${id}/report?format=json`).then(setR).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [id]);
  if (!r) return <Spinner />;
  const m = r.metrics;
  const items: [string, number, 'brand' | 'navy' | 'amber' | 'red' | 'sky'][] = [
    ['Participantes registrados', m.registered, 'navy'], ['Firmas completadas', m.signed, 'brand'], ['Asistencias válidas', m.valid, 'brand'],
    ['Planillas generadas', m.sheets, 'navy'], ['Comprobantes generados', m.receipts, 'sky'], ['Correos enviados', m.emailsSent, 'brand'],
    ['Correos pendientes', m.emailsPending, 'amber'], ['Correos fallidos', m.emailsFailed, 'red'],
  ];
  return (
    <div className="space-y-6">
      {!finalized && <p className="rounded-lg bg-mist p-3 text-sm text-slate-600">El informe definitivo se genera al cerrar el evento. Los indicadores muestran el estado actual.</p>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(([l, v, t]) => <StatCard key={l} label={l} value={v} tone={t} icon={<BarChart3 className="h-5 w-5" />} />)}
      </div>
      <Card title="Descargar informe de cierre" actions={<><a href={`/api/events/${id}/report?format=pdf`} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"><Download className="h-4 w-4" /> PDF</a><a href={`/api/events/${id}/report?format=xlsx`} className="inline-flex items-center gap-2 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white"><FileSpreadsheet className="h-4 w-4" /> Excel</a></>}>
        <p className="text-sm text-slate-600">El informe descargado refleja el estado actual de los envíos. La instantánea tomada en el momento del cierre se conserva como documento definitivo.</p>
        {r.snapshot && (
          <>
            {r.snapshot.incompleteRegistrations > 0 && <p className="mt-3 text-sm text-amber-800">{r.snapshot.incompleteRegistrations} registro(s) no completaron la firma y no recibieron comprobante.</p>}
            {r.snapshot.inconsistencies?.length > 0 && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">Inconsistencias detectadas en la verificación de firmas:</p>
                <ul className="list-disc pl-5">{r.snapshot.inconsistencies.map((x) => <li key={x.evidenceCode}>{x.evidenceCode}: {x.problem}</li>)}</ul>
              </div>
            )}
          </>
        )}
        {documents.length > 0 && (
          <div className="-mx-5 mt-4 overflow-x-auto">
            <table className="table-pro">
              <thead><tr><th>Documento definitivo</th><th>Código</th><th>SHA-256</th><th></th></tr></thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="text-sm">{doc.fileName}</td>
                    <td className="font-mono text-xs">{doc.verificationCode}</td>
                    <td className="max-w-[260px] truncate font-mono text-[11px]" title={doc.sha256}>{doc.sha256}</td>
                    <td><a href={`/api/documents/${doc.id}`} className="text-brand"><Download className="h-4 w-4" /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
