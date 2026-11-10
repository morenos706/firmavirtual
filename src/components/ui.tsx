'use client';
import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';
import { useEffect } from 'react';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'navy'; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'px-2.5 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        variant === 'primary' && 'bg-brand text-white shadow-sm hover:bg-brand-700',
        variant === 'navy' && 'bg-navy text-white shadow-sm hover:bg-navy-800',
        variant === 'secondary' && 'border border-slate-300 bg-white text-navy hover:bg-mist',
        variant === 'ghost' && 'text-navy hover:bg-mist',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className, icon }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
            {icon}
            {title}
          </h2>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  SCHEDULED: 'bg-sky-50 text-sky-800 ring-sky-200',
  ACTIVE: 'bg-brand-50 text-brand-800 ring-brand-100',
  FINALIZED: 'bg-navy text-white ring-navy',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-200',
  PENDING: 'bg-amber-50 text-amber-800 ring-amber-200',
  RETRYING: 'bg-orange-50 text-orange-800 ring-orange-200',
  SENT_TO_PROVIDER: 'bg-sky-50 text-sky-800 ring-sky-200',
  DELIVERED: 'bg-brand-50 text-brand-800 ring-brand-100',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
  FAILED: 'bg-red-100 text-red-800 ring-red-300',
  COMPLETED: 'bg-brand-50 text-brand-800 ring-brand-100',
  STARTED: 'bg-amber-50 text-amber-800 ring-amber-200',
  OTP_VERIFIED: 'bg-sky-50 text-sky-800 ring-sky-200',
  VOIDED: 'bg-red-50 text-red-700 ring-red-200',
};

export function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', BADGE[status ?? ''] ?? 'bg-slate-100 text-slate-700 ring-slate-200')}>{children}</span>;
}

export function StatCard({ label, value, icon, tone = 'brand', hint }: { label: string; value: number | string; icon: React.ReactNode; tone?: 'brand' | 'navy' | 'amber' | 'red' | 'sky'; hint?: string }) {
  const tones = { brand: 'bg-brand-50 text-brand', navy: 'bg-navy/10 text-navy', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600', sky: 'bg-sky-50 text-sky-700' };
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase leading-tight tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-navy">{value}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={clsx('max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h3 className="text-base font-bold text-navy">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-slate-400 hover:bg-mist hover:text-navy">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-mist text-slate-500">{icon}</div>
      <p className="font-semibold text-navy">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-brand" /> {label}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#176B52" />
        <path d="M8 8h6v6H8zM18 8h6v6h-6zM8 18h6v6H8z" fill="#fff" />
        <path d="M18.5 22.5c1.5-3 3-4.5 5.5-5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <span>
        Firma<span className="text-[#5FC79F]">QR</span>
      </span>
    </span>
  );
}
