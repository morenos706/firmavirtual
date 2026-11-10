import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/eventos', '/usuarios', '/auditoria', '/configuracion', '/correos'];

/** Redirige a /login si no hay cookie de sesión (la validación real ocurre en el servidor). */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !req.cookies.get('fqr_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
