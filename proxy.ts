import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyEdgeToken, SESSION_COOKIE } from '@/lib/auth-edge';
import { canAccessRoute } from '@/lib/pageAccessControl';

// Renamed from middleware.ts: Next.js deprecated the `middleware` file
// convention in favor of `proxy` (same API — NextRequest/NextResponse,
// `config.matcher` — just a rename). Industry-readiness fix: this file is
// the app's primary security boundary (session validation, page-level RBAC,
// now MFA enforcement), so it should not depend on a deprecated convention
// that could be removed in a future major version.

// /api/cron is public at the session-cookie layer because it's invoked by
// Vercel Cron with only a bearer secret (see app/api/cron/route.ts), which
// enforces its own, independent authentication.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/demo-login', '/api/health', '/api/setup', '/api/cron'];

// Reachable while mustChangePassword/MFA-incomplete — the user must be able
// to complete whichever gate is blocking them, and to log out.
const MFA_SETUP_PATHS = ['/mfa-setup', '/api/auth/mfa/setup', '/api/auth/mfa/verify'];
const MFA_VERIFY_PATHS = ['/mfa-verify', '/api/auth/mfa/validate', '/api/auth/mfa/backup'];
const ALWAYS_REACHABLE_WHILE_GATED = ['/api/auth/logout', '/api/session'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

function matchesAny(paths: string[], pathname: string): boolean {
  return paths.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', crypto.randomUUID());

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifyEdgeToken(token);
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL('/login?reason=session_expired', request.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (matchesAny(ALWAYS_REACHABLE_WHILE_GATED, pathname)) {
    requestHeaders.set('x-mes-user-id', session.userId);
    requestHeaders.set('x-mes-username', session.username);
    requestHeaders.set('x-mes-role', session.role);
    // Bug found via MFA E2E testing: this branch used to omit
    // x-mes-session-version, which getRequestSession()/isSessionValid()
    // (lib/api-auth.ts) treat as "no version to check" — so a session
    // revoked by an admin action (password reset, MFA reset, deactivation,
    // forced logout — all of which bump User.sessionVersion) still read back
    // as authenticated:true from /api/session until the token's natural
    // expiry. Forwarding it here matches the fall-through branch below and
    // makes GET /api/session (and hence any client relying on it, e.g.
    // SessionGuard) reflect a revoked session immediately.
    if (session.sessionVersion !== undefined) {
      requestHeaders.set('x-mes-session-version', String(session.sessionVersion));
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (session.mustChangePassword && pathname !== '/change-password' && !pathname.startsWith('/api/auth')) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Password change required' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/change-password', request.url));
  }

  // Industry-readiness fix: MFA is mandatory for every account. Mirrors the
  // mustChangePassword gate above — until enrollment (mfaEnabled) and this
  // session's second-factor check (mfaVerified) both pass, every other page
  // and API route is blocked except the MFA flow itself and logout.
  if (!session.mustChangePassword) {
    if (!session.mfaEnabled && !matchesAny(MFA_SETUP_PATHS, pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'MFA enrollment required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/mfa-setup', request.url));
    }
    if (session.mfaEnabled && !session.mfaVerified && !matchesAny(MFA_VERIFY_PATHS, pathname) && !matchesAny(MFA_SETUP_PATHS, pathname)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'MFA verification required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/mfa-verify', request.url));
    }
  }

  // HIGH-6 fix: page-level RBAC, previously described only in a test file
  // and a separate client-side-only guard, neither of which the old
  // middleware.ts actually enforced — any authenticated role could navigate
  // to (though not fetch data into) an admin/role-restricted page. API
  // routes are unaffected — they enforce their own, more granular checks
  // per route.
  if (!pathname.startsWith('/api/') && !canAccessRoute(session.role, pathname)) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  requestHeaders.set('x-mes-user-id', session.userId);
  requestHeaders.set('x-mes-username', session.username);
  requestHeaders.set('x-mes-role', session.role);
  if (session.sessionVersion !== undefined) {
    requestHeaders.set('x-mes-session-version', String(session.sessionVersion));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
