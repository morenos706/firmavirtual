'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, FileSignature, Loader2, MapPin, PenLine, RotateCcw, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { Button, Logo } from '@/components/ui';
import { SignatureCanvas, type SignatureHandle, type SignatureResult } from '@/components/signature-pad';
import { ApiError, apiFetch, errorMessage, fmtDay } from '@/lib/client';

type Pub = {
  company: { name: string; hasLogo: boolean };
  event: { name: string; program: string; topic: string; trainer: string; institution: string; date: string; startTime: string; endTime: string; location: string; otpChannel: string; requireDataConsent: boolean };
  fields: { key: string; label: string; required: boolean }[];
  legal: { agreement: { id: string; version: string; title: string; content: string } | null; dataTreatment: { id: string; version: string; title: string; content: string } | null };
  availability: { open: boolean; reason: string | null };
};
const STEPS = ['Datos', 'Verificación', 'Acuerdo', 'Firma', 'Confirmación'];
const INPUT_TYPES: Record<string, string> = { email: 'email', phone: 'tel', documentNumber: 'text' };

export default function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const storeKey = `fqr-reg-${token}`;
  const [pub, setPub] = useState<Pub | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [regToken, setRegToken] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<{ destinationMasked: string; channel: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState({ agreement: false, data: false });
  const [sig, setSig] = useState<SignatureResult | null>(null);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState<{ evidenceCode: string; completedAt: string } | null>(null);
  const pad = useRef<SignatureHandle>(null);

  useEffect(() => {
    apiFetch<Pub>(`/api/public/r/${token}`).then(setPub).catch((e) => setLoadError(e instanceof ApiError && e.status === 404 ? 'Código QR no válido.' : errorMessage(e)));
  }, [token]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const headers = useCallback(() => ({ 'x-registration-token': regToken ?? '' }), [regToken]);
  const fail = (e: unknown) => {
    setMsg(errorMessage(e));
    if (e instanceof ApiError && (e.code === 'REGISTRATION_EXPIRED' || e.code === 'REGISTRATION_CLOSED' || e.code === 'REGISTRATION_INVALID')) {
      sessionStorage.removeItem(storeKey);
    }
  };

  const submitData = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErrors({});
    try {
      const r = await apiFetch<{ registrationToken: string; otp: { destinationMasked: string; channel: string; devCode?: string } }>(`/api/public/r/${token}/start`, { body: form });
      setRegToken(r.registrationToken);
      sessionStorage.setItem(storeKey, r.registrationToken);
      setOtpInfo(r.otp);
      setCooldown(60);
      setStep(1);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await apiFetch('/api/public/registration/verify', { body: { code }, headers: headers() });
      setStep(2);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setMsg('');
    try {
      const r = await apiFetch<{ destinationMasked: string; channel: string; devCode?: string }>('/api/public/registration/resend', { method: 'POST', headers: headers() });
      setOtpInfo(r);
      setCooldown(60);
      setMsg('Le enviamos un nuevo código.');
    } catch (err) {
      fail(err);
    }
  };
  const acceptAll = async () => {
    if (!pub) return;
    setBusy(true);
    setMsg('');
    try {
      await apiFetch('/api/public/registration/consent', { body: { type: 'SIGNATURE_AGREEMENT', legalTextId: pub.legal.agreement!.id, accepted: true }, headers: headers() });
      if (pub.legal.dataTreatment) await apiFetch('/api/public/registration/consent', { body: { type: 'DATA_TREATMENT', legalTextId: pub.legal.dataTreatment.id, accepted: true }, headers: headers() });
      setStep(3);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const confirmSignature = () => {
    const s = pad.current?.capture();
    if (!s || s.pointCount < 10) {
      setMsg('Por favor firme en el recuadro blanco.');
      return;
    }
    setMsg('');
    setSig(s);
    setStep(4);
  };
  const finish = async () => {
    if (!sig) return;
    setBusy(true);
    setMsg('');
    try {
      const device = { screen: `${screen.width}x${screen.height}`, pixelRatio: window.devicePixelRatio, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      const r = await apiFetch<{ evidenceCode: string; completedAt: string }>('/api/public/registration/complete', { body: { ...sig, device }, headers: headers() });
      sessionStorage.removeItem(storeKey);
      setDone(r);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Shell><Notice icon={<XCircle className="h-10 w-10 text-red-500" />} title="No disponible" text={loadError} /></Shell>;
  if (!pub) return <Shell><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div></Shell>;
  const ev = pub.event;

  return (
    <Shell company={pub.company}>
      <div className="rounded-2xl bg-navy p-5 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#5FC79F]">Registro de asistencia</p>
        <h1 className="mt-1 text-xl font-bold leading-snug sm:text-2xl">{ev.name}</h1>
        <p className="mt-1 text-sm text-slate-300">{ev.program} · {ev.topic}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {fmtDay(ev.date)}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {ev.startTime}–{ev.endTime}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {ev.location}</span>
          <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {ev.trainer}</span>
        </div>
      </div>

      {!pub.availability.open ? (
        <Notice icon={<XCircle className="h-10 w-10 text-slate-400" />} title="Registro no disponible" text={pub.availability.reason ?? ''} />
      ) : done ? (
        <div className="card mt-5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-brand" />
          <h2 className="mt-3 text-xl font-bold text-navy">¡Asistencia registrada!</h2>
          <p className="mt-2 text-sm text-slate-600">Su firma electrónica quedó registrada con el identificador:</p>
          <p className="mt-2 rounded-lg bg-mist px-3 py-2 font-mono text-lg font-bold tracking-wider text-navy">{done.evidenceCode}</p>
          <p className="mt-4 text-sm text-slate-600">Cuando el organizador cierre el evento recibirá su comprobante de asistencia en PDF en el correo <strong>{form.email}</strong>.</p>
        </div>
      ) : (
        <>
          <ol className="mt-5 flex items-center gap-1" aria-label="Progreso">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col items-center gap-1">
                <span className={`h-1.5 w-full rounded-full ${i <= step ? 'bg-brand' : 'bg-slate-200'}`} />
                <span className={`hidden text-[11px] font-semibold sm:block ${i === step ? 'text-brand' : 'text-slate-400'}`}>{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-center text-xs font-semibold text-slate-500 sm:hidden">Paso {step + 1} de 5 · {STEPS[step]}</p>

          <div className="card mt-4 p-5">
            {step === 0 && (
              <form onSubmit={submitData} className="space-y-4" noValidate>
                <h2 className="text-lg font-bold text-navy">Sus datos</h2>
                {pub.fields.map((f) => (
                  <label key={f.key} className="block">
                    <span className="label">{f.label}{f.required || (f.key === 'phone' && ev.otpChannel === 'SMS') ? ' *' : ''}</span>
                    <input
                      className="input text-base"
                      type={INPUT_TYPES[f.key] ?? 'text'}
                      inputMode={f.key === 'documentNumber' || f.key === 'phone' ? 'numeric' : undefined}
                      autoComplete={f.key === 'email' ? 'email' : f.key === 'fullName' ? 'name' : f.key === 'phone' ? 'tel' : 'off'}
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                      maxLength={f.key === 'documentNumber' ? 20 : 150}
                    />
                    {errors[f.key] && <span className="mt-1 block text-xs text-red-600">{errors[f.key]}</span>}
                  </label>
                ))}
                <p className="text-xs text-slate-500">Le enviaremos un código de verificación {ev.otpChannel === 'SMS' ? 'por SMS a su celular' : 'a su correo electrónico'}.</p>
                <Button type="submit" size="lg" className="w-full" loading={busy}>Continuar</Button>
              </form>
            )}
            {step === 1 && (
              <form onSubmit={verify} className="space-y-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-8 w-8 text-brand" />
                  <div>
                    <h2 className="text-lg font-bold text-navy">Verifique su identidad</h2>
                    <p className="text-sm text-slate-600">Ingrese el código de 6 dígitos enviado a <strong>{otpInfo?.destinationMasked}</strong>.</p>
                  </div>
                </div>
                {otpInfo?.devCode && <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Modo desarrollo: código {otpInfo.devCode}</p>}
                <input className="input text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Código OTP" autoFocus />
                <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>Verificar código</Button>
                <button type="button" onClick={resend} disabled={cooldown > 0} className="w-full text-center text-sm font-semibold text-brand disabled:text-slate-400">
                  {cooldown > 0 ? `Reenviar código en ${cooldown} s` : 'Reenviar código'}
                </button>
              </form>
            )}
            {step === 2 && pub.legal.agreement && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-navy"><FileSignature className="h-5 w-5 text-brand" /> {pub.legal.agreement.title}</h2>
                <div className="max-h-64 overflow-y-auto whitespace-pre-line rounded-lg border border-slate-200 bg-mist p-3 text-sm leading-relaxed text-slate-700">{pub.legal.agreement.content}</div>
                <p className="text-xs text-slate-500">Versión {pub.legal.agreement.version}</p>
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand" checked={accepted.agreement} onChange={(e) => setAccepted((a) => ({ ...a, agreement: e.target.checked }))} />
                  <span>He leído y <strong>acepto expresamente</strong> el acuerdo de uso de firma electrónica.</span>
                </label>
                {pub.legal.dataTreatment && (
                  <>
                    <h3 className="pt-2 text-base font-bold text-navy">{pub.legal.dataTreatment.title}</h3>
                    <div className="max-h-56 overflow-y-auto whitespace-pre-line rounded-lg border border-slate-200 bg-mist p-3 text-sm leading-relaxed text-slate-700">{pub.legal.dataTreatment.content}</div>
                    <p className="text-xs text-slate-500">Versión {pub.legal.dataTreatment.version}</p>
                    <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                      <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand" checked={accepted.data} onChange={(e) => setAccepted((a) => ({ ...a, data: e.target.checked }))} />
                      <span><strong>Autorizo</strong> el tratamiento de mis datos personales en los términos descritos.</span>
                    </label>
                  </>
                )}
                <Button size="lg" className="w-full" loading={busy} disabled={!accepted.agreement || (Boolean(pub.legal.dataTreatment) && !accepted.data)} onClick={acceptAll}>Aceptar y continuar</Button>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-navy"><PenLine className="h-5 w-5 text-brand" /> Firme en el recuadro</h2>
                <SignatureCanvas ref={pad} onChange={setSigEmpty} />
                <Button size="lg" className="w-full" disabled={sigEmpty} onClick={confirmSignature}>Confirmar firma</Button>
              </div>
            )}
            {step === 4 && sig && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-navy">Confirme su registro</h2>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {pub.fields.filter((f) => form[f.key]).map((f) => (
                    <div key={f.key}><dt className="text-xs text-slate-500">{f.label}</dt><dd className="font-semibold text-navy">{form[f.key]}</dd></div>
                  ))}
                </dl>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sig.imageDataUrl} alt="Su firma" className="mx-auto max-h-32 rounded-lg border border-slate-200 bg-white p-2" />
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" onClick={() => { setSig(null); setStep(3); }}><RotateCcw className="h-4 w-4" /> Repetir firma</Button>
                  <Button size="lg" className="flex-1" loading={busy} onClick={finish}>Confirmar registro</Button>
                </div>
                <p className="text-xs text-slate-500">Al confirmar, su firma quedará vinculada a este evento junto con la evidencia de verificación y la versión del acuerdo aceptado.</p>
              </div>
            )}
            {msg && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.startsWith('Le enviamos') ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'}`} role="alert">{msg}</p>}
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children, company }: { children: React.ReactNode; company?: { name: string; hasLogo: boolean } }) {
  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          {company?.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/settings/logo" alt={company.name} className="max-h-8" />
          ) : (
            <span className="text-sm font-bold text-navy">{company?.name}</span>
          )}
          <Logo className="text-base text-navy" />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}

function Notice({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card mt-5 flex flex-col items-center p-8 text-center">
      {icon}
      <h2 className="mt-3 text-lg font-bold text-navy">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}
