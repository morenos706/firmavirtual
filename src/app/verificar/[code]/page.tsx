'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileSearch, Loader2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { Logo } from '@/components/ui';
import { apiFetch } from '@/lib/client';

type V =
  | { found: false }
  | {
      found: true; kind: 'ATTENDANCE' | 'DOCUMENT'; code: string; typeLabel: string; status: string; recordId: string; participant: string | null;
      event: { name: string; code: string; date: string }; signedAt: string | null; authMethod: string | null; evidenceHash: string | null;
      document: { typeLabel: string; sha256: string; createdAt: string } | null; integrity: { evidence: boolean | null; signature: boolean | null; document: boolean | null };
    };

async function sha256File(f: File) {
  const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [v, setV] = useState<V | null>(null);
  const [cmp, setCmp] = useState<{ match: boolean; reason: string; hash: string } | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    apiFetch<V>(`/api/public/verify/${encodeURIComponent(code)}`).then(setV).catch(() => setV({ found: false }));
  }, [code]);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setChecking(true);
    const hash = await sha256File(f); // el archivo no sale del navegador: solo se envía su huella
    const r = await apiFetch<{ match: boolean; reason: string }>(`/api/public/verify/${encodeURIComponent(code)}`, { body: { sha256: hash } });
    setCmp({ ...r, hash });
    setChecking(false);
  };
  const Check = ({ ok, label }: { ok: boolean | null; label: string }) =>
    ok === null ? null : (
      <li className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-brand" /> : <XCircle className="h-4 w-4 text-red-600" />}{label}: <strong>{ok ? 'íntegro' : 'NO coincide'}</strong></li>
    );
  return (
    <div className="min-h-screen bg-mist px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="color-bar mb-4 h-1.5 rounded" aria-hidden />
        <Link href="/verificar"><Logo className="text-xl text-navy" /></Link>
        {!v ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div> : !v.found ? (
          <div className="card mt-6 p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-3 text-xl font-bold text-navy">Documento no encontrado</h1>
            <p className="mt-1 text-sm text-slate-600">No existe un registro con el código <span className="font-mono">{decodeURIComponent(code)}</span>.</p>
          </div>
        ) : (
          <>
            <div className={`card mt-6 overflow-hidden`}>
              <div className={`flex items-center gap-3 p-5 text-white ${v.status === 'VIGENTE' ? 'bg-sec3' : 'bg-red-600'}`}>
                <ShieldCheck className="h-8 w-8" />
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-80">{v.typeLabel}</p>
                  <h1 className="text-xl font-bold">Documento {v.status === 'VIGENTE' ? 'existente y vigente' : 'anulado'}</h1>
                </div>
              </div>
              <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Código de verificación</dt><dd className="font-mono font-semibold">{v.code}</dd></div>
                <div><dt className="text-xs text-slate-500">Identificador del registro</dt><dd className="break-all font-mono text-xs">{v.recordId}</dd></div>
                <div><dt className="text-xs text-slate-500">Evento</dt><dd className="font-semibold">{v.event.name} <span className="font-normal text-slate-500">({v.event.code})</span></dd></div>
                <div><dt className="text-xs text-slate-500">Fecha del evento</dt><dd>{v.event.date}</dd></div>
                {v.participant && <div><dt className="text-xs text-slate-500">Participante</dt><dd>{v.participant}</dd></div>}
                {v.signedAt && <div><dt className="text-xs text-slate-500">Firmado</dt><dd>{v.signedAt} · {v.authMethod}</dd></div>}
                {v.evidenceHash && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Huella SHA-256 del expediente</dt><dd className="break-all font-mono text-xs">{v.evidenceHash}</dd></div>}
                {v.document && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Huella SHA-256 del documento conservado ({v.document.typeLabel})</dt><dd className="break-all font-mono text-xs">{v.document.sha256}</dd></div>}
              </dl>
              <div className="border-t border-slate-100 p-5">
                <h2 className="mb-2 text-sm font-bold text-navy">Integridad del expediente conservado</h2>
                <ul className="space-y-1">
                  <Check ok={v.integrity.evidence} label="Paquete de evidencia" />
                  <Check ok={v.integrity.signature} label="Imagen de la firma" />
                  <Check ok={v.integrity.document} label="Documento PDF" />
                </ul>
              </div>
            </div>
            {v.document && (
              <div className="card mt-4 p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-navy"><FileSearch className="h-5 w-5 text-brand" /> ¿El archivo que tiene es auténtico?</h2>
                <p className="mt-1 text-sm text-slate-600">Seleccione el PDF. Se calcula su huella SHA-256 en su navegador (el archivo no se envía) y se compara con el documento conservado.</p>
                <input type="file" accept="application/pdf" className="mt-3 block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
                {checking && <p className="mt-3 text-sm text-slate-500">Calculando…</p>}
                {cmp && (
                  <div className={`mt-3 rounded-lg p-3 text-sm ${cmp.match ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'}`}>
                    <p className="font-semibold">{cmp.reason}</p>
                    <p className="mt-1 break-all font-mono text-[11px]">{cmp.hash}</p>
                  </div>
                )}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">La huella SHA-256 permite comprobar la integridad documental. No corresponde a una firma digital certificada. Por protección de datos personales (Ley 1581 de 2012) esta consulta no muestra información sensible.</p>
          </>
        )}
      </div>
    </div>
  );
}
