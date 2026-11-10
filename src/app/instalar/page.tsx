'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button, Field, Logo } from '@/components/ui';
import { apiFetch, errorMessage } from '@/lib/client';

export default function InstallPage() {
  const [state, setState] = useState<{ needsSetup: boolean; tokenRequired: boolean } | null>(null);
  const [v, setV] = useState({ companyName: 'PREBEL S.A.', name: '', email: '', password: '', password2: '', setupToken: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    apiFetch<{ needsSetup: boolean; tokenRequired: boolean }>('/api/setup').then(setState).catch((e) => setErr(errorMessage(e)));
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (v.password !== v.password2) return setErr('Las contraseñas no coinciden.');
    setBusy(true);
    try {
      await apiFetch('/api/setup', { body: { companyName: v.companyName, name: v.name, email: v.email, password: v.password, setupToken: v.setupToken || undefined } });
      setDone(true);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="min-h-screen bg-mist">
      <div className="color-bar h-1.5" />
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/prebel-logo-azul.png" alt="Prebel" className="h-8" />
          <Logo className="text-lg text-navy" />
        </div>
        <div className="card p-6">
          <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><ShieldCheck className="h-6 w-6" /> Instalación inicial</h1>
          {!state && !err && <p className="mt-4 text-sm">Verificando…</p>}
          {done ? (
            <div className="mt-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-sec4" />
              <p className="mt-2 font-semibold">Plataforma instalada.</p>
              <Link href="/login" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Iniciar sesión</Link>
            </div>
          ) : state && !state.needsSetup ? (
            <p className="mt-4 text-sm">La plataforma ya está instalada. <Link href="/login" className="font-semibold text-brand">Iniciar sesión →</Link></p>
          ) : state ? (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <p className="text-sm">Cree el primer administrador. Esta página se desactiva automáticamente cuando exista un administrador.</p>
              <Field label="Empresa"><input className="input" required value={v.companyName} onChange={set('companyName')} /></Field>
              <Field label="Nombre del administrador"><input className="input" required value={v.name} onChange={set('name')} /></Field>
              <Field label="Correo"><input className="input" type="email" required value={v.email} onChange={set('email')} /></Field>
              <Field label="Contraseña" hint="Mínimo 10 caracteres con mayúsculas, minúsculas y números."><input className="input" type="password" autoComplete="new-password" required value={v.password} onChange={set('password')} /></Field>
              <Field label="Confirmar contraseña"><input className="input" type="password" autoComplete="new-password" required value={v.password2} onChange={set('password2')} /></Field>
              {state.tokenRequired && <Field label="Código de instalación (SETUP_TOKEN)"><input className="input" required value={v.setupToken} onChange={set('setupToken')} /></Field>}
              <Button type="submit" className="w-full" loading={busy}>Instalar</Button>
            </form>
          ) : null}
          {err && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p>}
        </div>
      </div>
    </div>
  );
}
