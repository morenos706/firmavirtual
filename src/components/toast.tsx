'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const Ctx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`flex items-start gap-3 rounded-lg border bg-white p-3 text-sm shadow-lg ${t.kind === 'error' ? 'border-red-200' : t.kind === 'success' ? 'border-brand-100' : 'border-slate-200'}`}>
            {t.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" /> : t.kind === 'error' ? <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" /> : <Info className="h-5 w-5 shrink-0 text-navy" />}
            <p className="flex-1 text-navy">{t.text}</p>
            <button onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} aria-label="Cerrar" className="text-slate-400 hover:text-navy">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
