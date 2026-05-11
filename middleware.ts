import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyEdgeToken, SESSION_COOKIE } from '@/lib/auth-edge';

const ROLE_REQUIREMENTS: Record<string, string[]> = {
  '/planner': ['ADMIN', 'PLANNER', 'SUPERVISOR'],
  '/operator': ['ADMIN', 'OPERATOR', 'SUPERVISOR'],
  '/quality': ['ADMIN', 'QUALITY', 'QC', 'SUPERVISOR'],
  '/settings': ['ADMIN', 'SUPERVISOR'],
  '/settings/connectors': ['ADMIN'],
  '/workflows': ['ADMIN', 'PLANNER', 'SUPERVISOR'],
  '/workflows/designer': ['ADMIN', 'PLANNER', 'SUPERVISOR'],
  '/spc': ['ADMIN', 'QUALITY', 'QC', 'SUPERVISOR'],
  '/recipes': ['ADMIN', 'PLANNER', 'SUPERVISOR'],
  '/shifts': ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
  '/maintenance': ['ADMIN', 'MAINTENANCE', 'SUPERVISOR'],
  '/audit': ['ADMIN', 'SUPERVISOR'],
  '/reports': ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'],
  '/api/reports': ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'],
};

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/api/setup'];
const MACHINE_API_PREFIXES = ['/api/rfid/ingest', '/api/events', '/api/machines/telemetry'];

function addSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-XSS-Protection', '1; mode=block');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const dest = token ? '/dashboard' : '/login';
    return addSecurityHeaders(NextResponse.redirect(new URL(dest, request.url)));
  }

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
  if (isPublic) {
    return addSecurityHeaders(NextResponse.next());
  }

  const apiKey = process.env.MES_API_KEY;
  const isMachineApi =
    pathname.startsWith('/api/') &&
    MACHINE_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));

  if (apiKey && isMachineApi) {
    const providedKey = request.headers.get('x-api-key');
    if (providedKey !== apiKey) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized - API key required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return addSecurityHeaders(NextResponse.next());
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyEdgeToken(token) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized - please log in' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // MUST CHANGE PASSWORD ENFORCEMENT
  const isChangePasswordFlow = pathname === '/change-password' || pathname === '/api/auth/change-password' || pathname === '/api/auth/logout';
  if (session.mustChangePassword && !isChangePasswordFlow) {
    if (pathname.startsWith('/api/')) {
        return new NextResponse(
            JSON.stringify({ error: 'Forbidden - must change password first' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
    }
    return addSecurityHeaders(NextResponse.redirect(new URL('/change-password', request.url)));
  }

  for (const [prefix, allowed] of Object.entries(ROLE_REQUIREMENTS)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      if (!allowed.includes(session.role)) {
        if (pathname.startsWith('/api/')) {
          return new NextResponse(
            JSON.stringify({ error: 'Forbidden - insufficient permissions' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        url.searchParams.set('denied', '1');
        return addSecurityHeaders(NextResponse.redirect(url));
      }
      break;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-mes-user-id', session.userId);
  requestHeaders.set('x-mes-username', session.username);
  requestHeaders.set('x-mes-role', session.role);
  requestHeaders.set('x-correlation-id', crypto.randomUUID());

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return addSecurityHeaders(res);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
