'use client';
import { useCallback, useEffect, useState } from 'react';
import { Building2, FileText, ImageUp, Save, Scale, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, Modal, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { apiFetch, errorMessage, fmtDate } from '@/lib/client';

type S = { companyName: string; companyNit: string | null; logoPath: string | null; formatCode: string; formatVersion: string; sheetTitle: string; sheetShowSignature: boolean; receiptFooterNote: string | null; supportEmail: string | null };
type T = { id: string; type: 'SIGNATURE_AGREEMENT' | 'DATA_TREATMENT'; version: string; title: string; content: string; sha256: string; active: boolean; createdAt: string; _count: { consents: number } };
const TYPE: Record<string, string> = { SIGNATURE_AGREEMENT: 'Acuerdo de firma electrónica', DATA_TREATMENT: 'Tratamiento de datos personales' };

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<S | null>(null);
  const [texts, setTexts] = useState<T[]>([]);
  const [busy, setBusy] = useState('');
  const [logoV, setLogoV] = useState(0);
  const [draft, setDraft] = useState<{ type: T['type']; version: string; title: string; content: string } | null>(null);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([apiFetch<{ settings: S }>('/api/settings'), apiFetch<{ texts: T[] }>('/api/legal')]);
    setS(a.settings);
    setTexts(b.texts);
  }, []);
  useEffect(() => { load().catch((e) => toast('error', errorMessage(e))); }, [load, toast]);
  if (!s) return <Spinner />;

  const wrap = async (k: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(k);
    try { await fn(); toast('success', ok); await load(); } catch (e) { toast('error', errorMessage(e)); } finally { setBusy(''); }
  };
  const saveSettings = () => wrap('s', () => apiFetch('/api/settings', { method: 'PUT', body: { ...s, companyNit: s.companyNit || null, receiptFooterNote: s.receiptFooterNote || null, supportEmail: s.supportEmail || '' } }), 'Configuración guardada.');
  const uploadLogo = (f?: File) => {
    if (!f) return;
    const fd = new FormData();
    fd.append('logo', f);
    wrap('logo', async () => { await apiFetch('/api/settings/logo', { body: fd }); setLogoV((v) => v + 1); }, 'Logo actualizado.');
  };
  const publish = () => draft && wrap('legal', async () => { await apiFetch('/api/legal', { body: draft }); setDraft(null); }, 'Nueva versión publicada.');
  const set = <K extends keyof S>(k: K, v: S[K]) => setS({ ...s, [k]: v });

  return (
    <>
      <PageHeader title="Configuración" subtitle="Identidad institucional, formato oficial y textos jurídicos." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Empresa y formato" icon={<Building2 className="h-4 w-4" />} actions={<Button size="sm" loading={busy === 's'} onClick={saveSettings}><Save className="h-4 w-4" /> Guardar</Button>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de la empresa" className="sm:col-span-2"><input className="input" value={s.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
            <Field label="NIT"><input className="input" value={s.companyNit ?? ''} onChange={(e) => set('companyNit', e.target.value)} /></Field>
            <Field label="Correo de soporte"><input className="input" type="email" value={s.supportEmail ?? ''} onChange={(e) => set('supportEmail', e.target.value)} /></Field>
            <Field label="Código del formato"><input className="input" value={s.formatCode} onChange={(e) => set('formatCode', e.target.value)} /></Field>
            <Field label="Versión del formato"><input className="input" value={s.formatVersion} onChange={(e) => set('formatVersion', e.target.value)} /></Field>
            <Field label="Título de la planilla" className="sm:col-span-2"><input className="input" value={s.sheetTitle} onChange={(e) => set('sheetTitle', e.target.value)} /></Field>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={s.sheetShowSignature} onChange={(e) => set('sheetShowSignature', e.target.checked)} />
              <span>Incluir la columna <strong>«Firma»</strong> en la planilla oficial con la imagen de la firma manuscrita de cada asistente.</span>
            </label>
            <Field label="Nota adicional del comprobante" className="sm:col-span-2"><textarea className="input" rows={2} value={s.receiptFooterNote ?? ''} onChange={(e) => set('receiptFooterNote', e.target.value)} /></Field>
          </div>
        </Card>
        <Card title="Logo institucional" icon={<ImageUp className="h-4 w-4" />}>
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-mist">
            {s.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/settings/logo?v=${logoV}`} alt="Logo" className="max-h-20" />
            ) : <span className="text-sm text-slate-500">Sin logo: se mostrará el nombre de la empresa</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <ImageUp className="h-4 w-4" /> {busy === 'logo' ? 'Subiendo…' : 'Subir PNG o JPG'}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
            {s.logoPath && <Button variant="secondary" onClick={() => wrap('rm', () => apiFetch('/api/settings/logo', { method: 'DELETE' }), 'Logo eliminado.')}><Trash2 className="h-4 w-4" /> Quitar</Button>}
          </div>
          <p className="mt-3 text-xs text-slate-500">Use únicamente un logo cuyo uso esté autorizado por la empresa. Aparece en la planilla oficial, los comprobantes, el cartel del QR y el formulario de registro.</p>
        </Card>
      </div>

      <Card title="Textos jurídicos versionados" icon={<Scale className="h-4 w-4" />} className="mt-6" actions={<Button size="sm" onClick={() => setDraft({ type: 'SIGNATURE_AGREEMENT', version: '', title: '', content: '' })}><FileText className="h-4 w-4" /> Nueva versión</Button>}>
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Los textos por defecto son una base de trabajo y <strong>deben ser revisados por un abogado colombiano</strong>. Cada cambio crea una nueva versión; las aceptaciones anteriores conservan la versión y la huella del texto aceptado. Use <code>{'{{EMPRESA}}'}</code> para insertar el nombre de la empresa.</p>
        <div className="-mx-5 overflow-x-auto">
          <table className="table-pro">
            <thead><tr><th>Tipo</th><th>Versión</th><th>Título</th><th>Estado</th><th className="text-center">Aceptaciones</th><th>Publicado</th><th></th></tr></thead>
            <tbody>
              {texts.map((t) => (
                <tr key={t.id}>
                  <td className="text-sm">{TYPE[t.type]}</td>
                  <td className="font-mono text-sm">{t.version}</td>
                  <td className="text-sm">{t.title}</td>
                  <td><Badge status={t.active ? 'ACTIVE' : 'DRAFT'}>{t.active ? 'Vigente' : 'Histórica'}</Badge></td>
                  <td className="text-center">{t._count.consents}</td>
                  <td className="text-xs">{fmtDate(t.createdAt)}</td>
                  <td><Button size="sm" variant="ghost" onClick={() => setDraft({ type: t.type, version: '', title: t.title, content: t.content })}>Basar nueva versión</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={Boolean(draft)} onClose={() => setDraft(null)} wide title="Publicar nueva versión" footer={<><Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button><Button loading={busy === 'legal'} onClick={publish}>Publicar versión</Button></>}>
        {draft && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tipo"><select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as T['type'] })}><option value="SIGNATURE_AGREEMENT">{TYPE.SIGNATURE_AGREEMENT}</option><option value="DATA_TREATMENT">{TYPE.DATA_TREATMENT}</option></select></Field>
            <Field label="Versión"><input className="input" placeholder="1.1" value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} /></Field>
            <Field label="Título"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label="Contenido" className="sm:col-span-3"><textarea className="input min-h-[300px] text-sm" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
