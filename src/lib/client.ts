'use client';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { path: string; message: string }[]) {
    super(message);
  }
}

/** fetch con cabecera anti-CSRF y manejo uniforme de errores. */
export async function apiFetch<T = unknown>(url: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'X-Requested-With': 'FirmaQR', ...(isForm || !opts.body ? {} : { 'Content-Type': 'application/json' }), ...opts.headers },
    body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/public') && !url.startsWith('/api/auth/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    const e = (data as { error?: { code: string; message: string; details?: { path: string; message: string }[] } }).error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Error inesperado', e?.details);
  }
  return data as T;
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.details?.length) return `${e.message} ${e.details.map((d) => d.message).join(' · ')}`;
    return e.message;
  }
  return 'No fue posible completar la operación. Verifique su conexión.';
}

export const fmtDate = (iso: string | Date | null | undefined) =>
  iso ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—';
export const fmtDay = (isoDate: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
