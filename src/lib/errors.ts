export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión.'),
  forbidden: (msg = 'No tiene permisos para realizar esta acción.') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} no encontrado.`),
  conflict: (code: string, msg: string) => new AppError(409, code, msg),
  badRequest: (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details),
  tooMany: (msg = 'Demasiadas solicitudes. Intente más tarde.') => new AppError(429, 'RATE_LIMITED', msg),
  gone: (code: string, msg: string) => new AppError(410, code, msg),
};

export function isDbImmutableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('FIRMAQR_IMMUTABLE') || msg.includes('FIRMAQR_EVENT_CLOSED');
}
