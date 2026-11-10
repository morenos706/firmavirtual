'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button, Logo } from '@/components/ui';

export default function VerifyIndex() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4">
      <div className="card w-full max-w-md p-6">
        <Logo className="text-xl text-navy" />
        <h1 className="mt-6 flex items-center gap-2 text-xl font-bold text-navy"><ShieldCheck className="h-6 w-6 text-brand" /> Verificación documental</h1>
        <p className="mt-1 text-sm text-slate-600">Ingrese el código de verificación impreso en el comprobante o en la planilla (por ejemplo, FQR-XXXX-XXXX-XXXX).</p>
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) router.push(`/verificar/${encodeURIComponent(code.trim().toUpperCase())}`); }} className="mt-4 space-y-3">
          <input className="input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="FQR-XXXX-XXXX-XXXX" aria-label="Código de verificación" />
          <Button type="submit" className="w-full">Verificar</Button>
        </form>
      </div>
    </div>
  );
}
