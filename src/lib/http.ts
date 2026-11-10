import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { AppError, Errors, isDbImmutableError } from './errors';
import { rateLimit } from './rate-limit';
import { env } from './env';
import type { AuditActor } from './audit';
import type { SessionUser } from './auth';

export function clientIp(req: Request): string {
  const h = req.headers;
  if (env.trustProxy || !env.isProduction) {
    const xff = h.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    const real = h.get('x-real-ip');
    if (real) return real;
  }
  return 'unknown';
}

export function actorFrom(req: Request, user?: SessionUser | null): AuditActor {
  return {
    type: user ? 'USER' : 'PARTICIPANT',
    userId: user?.id ?? null,
    label: user ? `${user.name} <${user.email}>` : null,
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}

/**
 * Protección CSRF: toda petición que modifica estado debe
 *  1) provenir del mismo origen (cabecera Origin/Referer), y
 *  2) incluir la cabecera personalizada X-Requested-With: FirmaQR
 *     (no puede enviarse desde un formulario de otro sitio sin CORS).
 * La cookie de sesión además es HttpOnly + SameSite=Lax.
 */
export function assertSameOrigin(req: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  if (req.headers.get('x-requested-with') !== 'FirmaQR') throw Errors.forbidden('Solicitud no válida (CSRF).');
  const origin = req.headers.get('origin') || req.headers.get('referer');
  if (!origin) return; // clientes no-navegador (pruebas, integraciones) con cabecera personalizada
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try {
    const o = new URL(origin);
    if (o.host !== host && o.origin !== env.appUrl) throw Errors.forbidden('Origen no permitido (CSRF).');
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw Errors.forbidden('Origen no válido.');
  }
}

export function enforceRateLimit(req: Request, scope: string, limit: number, windowMs: number) {
  const r = rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (!r.ok) throw Errors.tooMany();
}

export async function parseJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<ZodInfer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.badRequest('Cuerpo JSON inválido.');
  }
  return schema.parse(body);
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Envoltura estándar de rutas API: CSRF, manejo de errores y respuestas uniformes. */
export function api<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>, opts: { csrf?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
  if (e instanceof ZodError) {
    return json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Hay datos inválidos en la solicitud.',
          details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      422,
    );
  }
  if (isDbImmutableError(e)) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('FIRMAQR_EVENT_CLOSED'))
      return json({ error: { code: 'EVENT_CLOSED', message: 'El evento no admite nuevos registros.' } }, 409);
    return json({ error: { code: 'IMMUTABLE', message: 'La evidencia registrada no puede modificarse.' } }, 409);
  }
  console.error('[api] error no controlado', e);
  return json({ error: { code: 'INTERNAL', message: 'Error interno del servidor.' } }, 500);
}

export type Ctx<P extends string = 'id'> = { params: Promise<Record<P, string>> };

export function fileResponse(buf: Buffer, fileName: string, mime: string, inline = false) {
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName.replace(/[^\w.\-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
