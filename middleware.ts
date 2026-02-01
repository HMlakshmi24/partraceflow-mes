import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const session = request.cookies.get('mes_session');
    const { pathname } = request.nextUrl;

    // 1. If trying to access protected routes without session
    if (!session && pathname !== '/login') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 2. If already logged in and trying to access login
    if (session && pathname === '/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // 3. Role Based Access Control
    if (session) {
        try {
            const user = JSON.parse(session.value);

            // Operators cannot access Planning or Analytics (strict mode)
            if (user.role === 'OPERATOR') {
                if (pathname.startsWith('/planner')) {
                    return NextResponse.redirect(new URL('/operator', request.url));
                }
                // Operators usually don't see full dashboards either, but allowing for now.
                // Actually, let's redirect root to operator for them
                if (pathname === '/' || pathname === '/dashboard') {
                    return NextResponse.redirect(new URL('/operator', request.url));
                }
            }
        } catch {
            // Invalid cookie
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
