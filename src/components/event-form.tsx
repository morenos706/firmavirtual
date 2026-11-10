'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Save } from 'lucide-react';
import { Button, Card, Field } from './ui';
import { useToast } from './toast';
import { ApiError, apiFetch, errorMessage } from '@/lib/client';

type FieldCfg = { key: string; label: string; enabled: boolean; required: boolean; order: number };
const FIXED = ['documentNumber', 'fullName', 'email'];
const DEFAULT_FIELDS: FieldCfg[] = [
  { key: 'documentNumber', label: 'Número de identificación (Cédula)', enabled: true, required: true, order: 1 },
  { key: 'fullName', label: 'Nombre y apellidos', enabled: true, required: true, order: 2 },
  { key: 'company', label: 'Empresa', enabled: true, required: true, order: 3 },
  { key: 'management', label: 'Gerencia', enabled: true, required: true, order: 4 },
  { key: 'area', label: 'Área', enabled: true, required: true, order: 5 },
  { key: 'email', label: 'Correo electrónico', enabled: true, required: true, order: 6 },
  { key: 'phone', label: 'Número de celular', enabled: false, required: false, order: 7 },
];

export type EventFormValues = {
  program: string; topic: string; relatedDocument: string; name: string; description: string; trainer: string; institution: string;
  classification: 'INTERNAL' | 'EXTERNAL'; date: string; startTime: string; endTime: string; durationHours: string; location: string;
  organizerId: string; otpChannel: 'EMAIL' | 'SMS'; requireDataConsent: boolean; duplicateRule: 'DOCUMENT' | 'DOCUMENT_AND_EMAIL'; fields: FieldCfg[];
};

const empty: EventFormValues = {
  program: '', topic: '', relatedDocument: '', name: '', description: '', trainer: '', institution: '', classification: 'INTERNAL',
  date: new Date().toISOString().slice(0, 10), startTime: '08:00', endTime: '10:00', durationHours: '2', location: '', organizerId: '',
  otpChannel: 'EMAIL', requireDataConsent: true, duplicateRule: 'DOCUMENT', fields: DEFAULT_FIELDS,
};

function hoursBetween(a: string, b: string) {
  const [h1, m1] = a.split(':').map(Number);
  const [h2, m2] = b.split(':').map(Number);
  const d = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
  return d > 0 ? String(Math.round(d * 100) / 100) : '';
}

export function EventForm({ eventId, initial, status, isAdmin }: { eventId?: string; initial?: Partial<EventFormValues>; status?: string; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<EventFormValues>({ ...empty, ...initial, fields: initial?.fields?.length ? initial.fields : DEFAULT_FIELDS });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [justification, setJustification] = useState('');
  const [organizers, setOrganizers] = useState<{ id: string; name: string }[]>([]);
  const finalized = status === 'FINALIZED';

  useEffect(() => {
    if (isAdmin) apiFetch<{ users: { id: string; name: string; active: boolean }[] }>('/api/users').then((r) => setOrganizers(r.users.filter((u) => u.active))).catch(() => {});
  }, [isAdmin]);

  const set = <K extends keyof EventFormValues>(k: K, val: EventFormValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const setTime = (k: 'startTime' | 'endTime', val: string) =>
    setV((x) => {
      const n = { ...x, [k]: val };
      const auto = hoursBetween(n.startTime, n.endTime);
      return auto ? { ...n, durationHours: auto } : n;
    });
  const setField = (key: string, patch: Partial<FieldCfg>) => setV((x) => ({ ...x, fields: x.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) }));
  const locked = (k: string) => finalized && !['description', 'location'].includes(k);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const data = { ...v, durationHours: Number(v.durationHours), organizerId: v.organizerId || undefined, relatedDocument: v.relatedDocument || null, description: v.description || null };
    try {
      if (eventId) {
        await apiFetch(`/api/events/${eventId}`, { method: 'PUT', body: { data, justification: justification || null } });
        toast('success', finalized ? 'Corrección registrada en auditoría.' : 'Evento actualizado.');
        router.push(`/eventos/${eventId}`);
      } else {
        const r = await apiFetch<{ event: { id: string; code: string } }>('/api/events', { body: data });
        toast('success', `Evento ${r.event.code} creado. Su código QR fue generado.`);
        router.push(`/eventos/${r.event.id}`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.path.replace(/^data\./, ''), d.message])));
      toast('error', errorMessage(err));
      setSaving(false);
    }
  };

  const text = (k: keyof EventFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={errors[k as string]}>
      <input className="input" value={v[k] as string} onChange={(e) => set(k, e.target.value as never)} disabled={locked(k as string)} {...props} />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      {finalized && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>El evento está <strong>finalizado</strong>. Los campos que forman parte de la evidencia de asistencia están bloqueados. Solo puede corregir la descripción y el lugar, con una justificación que quedará registrada en la auditoría.</p>
        </div>
      )}
      <Card title="Información del evento (planilla oficial)">
        <div className="grid gap-4 md:grid-cols-2">
          {text('program', 'Programa *', { required: true, maxLength: 200 })}
          {text('topic', 'Tema *', { required: true, maxLength: 250 })}
          {text('relatedDocument', 'Documento relacionado', { maxLength: 200, placeholder: 'Ej.: PR-CAL-014' })}
          {text('name', 'Nombre del evento *', { required: true, maxLength: 200 })}
          {text('trainer', 'Formador *', { required: true, maxLength: 150 })}
          {text('institution', 'Institución *', { required: true, maxLength: 150 })}
          <Field label="Clasificación *">
            <div className="flex gap-2">
              {(['INTERNAL', 'EXTERNAL'] as const).map((c) => (
                <button type="button" key={c} disabled={locked('classification')} onClick={() => set('classification', c)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${v.classification === c ? 'border-brand bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-600 hover:bg-mist'} disabled:opacity-60`}>
                  {c === 'INTERNAL' ? 'Interno' : 'Externo'}
                </button>
              ))}
            </div>
          </Field>
          {text('location', 'Lugar *', { required: true, maxLength: 200 })}
          <Field label="Descripción" className="md:col-span-2" error={errors.description}>
            <textarea className="input min-h-[80px]" value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
          </Field>
        </div>
      </Card>

      <Card title="Programación">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {text('date', 'Fecha *', { type: 'date', required: true })}
          <Field label="Hora de inicio *" error={errors.startTime}>
            <input type="time" className="input" value={v.startTime} onChange={(e) => setTime('startTime', e.target.value)} disabled={locked('startTime')} required />
          </Field>
          <Field label="Hora de finalización *" error={errors.endTime}>
            <input type="time" className="input" value={v.endTime} onChange={(e) => setTime('endTime', e.target.value)} disabled={locked('endTime')} required />
          </Field>
          {text('durationHours', 'Duración (horas) *', { type: 'number', step: '0.25', min: '0.25', required: true })}
          {isAdmin && (
            <Field label="Organizador responsable" hint="Por defecto, quien crea el evento.">
              <select className="input" value={v.organizerId} onChange={(e) => set('organizerId', e.target.value)} disabled={finalized}>
                <option value="">— Yo mismo —</option>
                {organizers.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Card>

      {!finalized && (
        <Card title="Registro de participantes">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Verificación OTP" hint="Código de un solo uso para autenticar al firmante.">
              <select className="input" value={v.otpChannel} onChange={(e) => set('otpChannel', e.target.value as 'EMAIL' | 'SMS')}>
                <option value="EMAIL">Correo electrónico</option>
                <option value="SMS">SMS al celular</option>
              </select>
            </Field>
            <Field label="Control de duplicados">
              <select className="input" value={v.duplicateRule} onChange={(e) => set('duplicateRule', e.target.value as EventFormValues['duplicateRule'])}>
                <option value="DOCUMENT">Un registro por identificación</option>
                <option value="DOCUMENT_AND_EMAIL">Un registro por identificación y por correo</option>
              </select>
            </Field>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={v.requireDataConsent} onChange={(e) => set('requireDataConsent', e.target.checked)} />
              Solicitar autorización de tratamiento de datos (Ley 1581 de 2012)
            </label>
          </div>
          <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-slate-600">Campos del formulario</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-pro">
              <thead>
                <tr><th>Campo</th><th>Etiqueta visible</th><th className="text-center">Solicitar</th><th className="text-center">Obligatorio</th></tr>
              </thead>
              <tbody>
                {v.fields.map((f) => {
                  const fixed = FIXED.includes(f.key);
                  const forcedPhone = f.key === 'phone' && v.otpChannel === 'SMS';
                  return (
                    <tr key={f.key}>
                      <td className="font-mono text-xs text-slate-500">{f.key}</td>
                      <td><input className="input" value={f.label} maxLength={80} onChange={(e) => setField(f.key, { label: e.target.value })} /></td>
                      <td className="text-center"><input type="checkbox" className="h-4 w-4 accent-brand" checked={f.enabled || forcedPhone} disabled={fixed || forcedPhone} onChange={(e) => setField(f.key, { enabled: e.target.checked, required: e.target.checked && f.required })} /></td>
                      <td className="text-center"><input type="checkbox" className="h-4 w-4 accent-brand" checked={f.required || forcedPhone} disabled={fixed || !f.enabled || forcedPhone} onChange={(e) => setField(f.key, { required: e.target.checked })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Identificación, nombre y correo siempre se solicitan: alimentan la planilla oficial y permiten la verificación OTP y el envío del comprobante.</p>
        </Card>
      )}

      {finalized && (
        <Card title="Justificación de la corrección">
          <textarea className="input min-h-[80px]" required minLength={10} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Describa el motivo de la corrección (mínimo 10 caracteres)" />
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" loading={saving}><Save className="h-4 w-4" /> {eventId ? 'Guardar cambios' : 'Crear evento'}</Button>
      </div>
    </form>
  );
}
