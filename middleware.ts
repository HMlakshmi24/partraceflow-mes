/**
 * Next.js Middleware — runs on every request before the page/API handler.
 *
 * Responsibilities:
 *  1. Redirect unauthenticated users to /login
 *  2. RBAC — redirect users without the required role
 *  3. Security headers on every response
 *  4. Optional API key protection (set MES_API_KEY in .env)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyEdgeToken, SESSION_COOKIE } from '@/lib/auth-edge';

// ─── Routes that require specific roles ───────────────────────────────────────

const ROLE_REQUIREMENTS: Record<string, string[]> = {
    '/planner':             ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/operator':            ['ADMIN', 'OPERATOR', 'SUPERVISOR'],
    '/quality':             ['ADMIN', 'QUALITY', 'QC', 'SUPERVISOR'],
    '/settings':            ['ADMIN', 'SUPERVISOR'],
    '/settings/connectors': ['ADMIN'],
    '/workflows':           ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/workflows/designer':  ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/spc':                 ['ADMIN', 'QUALITY', 'QC', 'SUPERVISOR'],
    '/recipes':             ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    '/shifts':              ['ADMIN', 'SUPERVISOR', 'OPERATOR'],
    '/maintenance':         ['ADMIN', 'MAINTENANCE', 'SUPERVISOR'],
    '/audit':               ['ADMIN', 'SUPERVISOR'],
};

// Public pages — no auth required
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/api/demo'];

// ─── Security headers added to every response ─────────────────────────────────

function addSecurityHeaders(res: NextResponse): NextResponse {
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'SAMEORIGIN');
    res.headers.set('X-XSS-Protection', '1; mode=block');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // CSP: allow same-origin + inline styles/scripts needed by Next.js
    res.headers.set(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires unsafe-eval in dev
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
        ].join('; ')
    );
    if (process.env.NODE_ENV === 'production') {
        res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    return res;
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Redirect root to dashboard or login
    if (pathname === '/') {
        const token = request.cookies.get(SESSION_COOKIE)?.value;
        const dest = token ? '/dashboard' : '/login';
        return addSecurityHeaders(NextResponse.redirect(new URL(dest, request.url)));
    }

    // 2. Skip auth for public paths and static assets
    const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
    if (isPublic) {
        return addSecurityHeaders(NextResponse.next());
    }

    // 3. Optional API key enforcement (set MES_API_KEY in .env for machine-to-machine)
    const apiKey = process.env.MES_API_KEY;
    if (apiKey && pathname.startsWith('/api/')) {
        const providedKey = request.headers.get('x-api-key');
        if (providedKey !== apiKey) {
            return new NextResponse(
                JSON.stringify({ error: 'Unauthorized — API key required' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }
        return addSecurityHeaders(NextResponse.next());
    }

    // 4. Verify session token
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifyEdgeToken(token) : null;

    if (!session) {
        // API routes: return 401 JSON instead of redirect
        if (pathname.startsWith('/api/')) {
            return new NextResponse(
                JSON.stringify({ error: 'Unauthorized — please log in' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }
        // Page routes: redirect to login preserving intended destination
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', pathname);
        return addSecurityHeaders(NextResponse.redirect(loginUrl));
    }

    // 5. RBAC check
    for (const [prefix, allowed] of Object.entries(ROLE_REQUIREMENTS)) {
        if (pathname === prefix || pathname.startsWith(prefix + '/')) {
            if (!allowed.includes(session.role)) {
                if (pathname.startsWith('/api/')) {
                    return new NextResponse(
                        JSON.stringify({ error: 'Forbidden — insufficient permissions' }),
                        { status: 403, headers: { 'Content-Type': 'application/json' } }
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

    // 6. Pass through — inject user info as headers for server components / API routes
    const res = NextResponse.next();
    res.headers.set('x-mes-user-id', session.userId);
    res.headers.set('x-mes-username', session.username);
    res.headers.set('x-mes-role', session.role);

    return addSecurityHeaders(res);
}

export const config = {
    matcher: [
        // Match everything except static files
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)',
    ],
};
