'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';
import { Button, Logo } from '@/components/ui';
import { apiFetch, errorMessage } from '@/lib/client';

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/auth/login', { body: { email, password } });
      const next = sp.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="label">Correo electrónico</span>
        <div className="relative">
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </label>
      <label className="block">
        <span className="label">Contraseña</span>
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Iniciar sesión
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-white lg:flex">
        <div className="color-bar absolute inset-x-0 top-0 h-2" aria-hidden />
        <div className="flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/prebel-logo-blanco.png" alt="Prebel" className="h-10 w-auto" />
          <Logo className="text-xl text-sand" />
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Registro digital de asistencia y firma electrónica</h1>
          <p className="mt-4 text-sand/90">Cree eventos, comparta un código QR y obtenga la planilla oficial con evidencia electrónica de cada firma, autenticación OTP y trazabilidad completa.</p>
        </div>
        <p className="text-xs text-sand/70">Ley 527 de 1999 · Decreto 2364 de 2012 · Ley 1581 de 2012</p>
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-sec2/25 blur-3xl" />
        <div className="color-bar absolute inset-x-0 bottom-0 h-2" aria-hidden />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/prebel-logo-azul.png" alt="Prebel" className="h-8 w-auto" />
            <Logo className="text-lg text-navy" />
          </div>
          <h2 className="text-2xl font-bold text-brand">Bienvenido</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Ingrese con su cuenta corporativa.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
