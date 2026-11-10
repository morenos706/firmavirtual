'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarCheck2, LayoutDashboard, LogOut, Mail, Menu, ScrollText, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Logo } from './ui';
import { apiFetch } from '@/lib/client';

type U = { name: string; email: string; role: 'ADMIN' | 'ORGANIZER' };

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/eventos', label: 'Eventos', icon: CalendarCheck2 },
  { href: '/correos', label: 'Correos', icon: Mail, admin: true },
  { href: '/usuarios', label: 'Usuarios', icon: Users, admin: true },
  { href: '/auditoria', label: 'Auditoría', icon: ScrollText, admin: true },
  { href: '/configuracion', label: 'Configuración', icon: Settings, admin: true },
];

export function AppShell({ user, companyName, hasLogo, children }: { user: U; companyName: string; hasLogo: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  };
  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.filter((n) => !n.admin || user.role === 'ADMIN').map((n) => {
        const active = path === n.href || path.startsWith(n.href + '/');
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition', active ? 'bg-brand text-white shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
          >
            <n.icon className="h-[18px] w-[18px]" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
  const sidebar = (
    <div className="flex h-full flex-col bg-navy pb-4 text-white">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/dashboard">
          <Logo className="text-xl text-white" />
        </Link>
        <button className="text-slate-300 lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mx-4 mb-4 rounded-lg bg-white/5 p-3">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/settings/logo" alt={companyName} className="mb-1 max-h-9 rounded bg-white p-1" />
        ) : null}
        <p className="truncate text-xs text-slate-300">{companyName}</p>
      </div>
      {nav}
      <div className="mx-3 mt-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold">{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <ShieldCheck className="h-3 w-3" /> {user.role === 'ADMIN' ? 'Administrador' : 'Organizador'}
            </p>
          </div>
          <button onClick={logout} className="rounded p-2 text-slate-300 hover:bg-white/10 hover:text-white" title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Abrir menú" className="rounded p-1.5 text-navy hover:bg-mist">
          <Menu className="h-5 w-5" />
        </button>
        <Logo className="text-lg text-navy" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
