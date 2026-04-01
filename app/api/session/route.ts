import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE, createSessionToken, COOKIE_OPTIONS } from '@/lib/auth';
import { SessionRoleSchema } from '@/lib/validation';

/**
 * GET /api/session — Returns current user from the session token.
 * Falls back to mes_role cookie for backwards compatibility.
 */
export async function GET(request: NextRequest) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
        const session = verifySessionToken(token);
        if (session) {
            return NextResponse.json({
                role: session.role,
                userId: session.userId,
                username: session.username,
                authenticated: true,
            });
        }
    }

    // Legacy fallback — mes_role cookie set by /settings role switcher
    const role = request.cookies.get('mes_role')?.value ?? 'ADMIN';
    return NextResponse.json({ role, authenticated: false });
}

/**
 * POST /api/session — Switch role (demo use only).
 * In production, roles come from the authenticated session, not from client-side switching.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = SessionRoleSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
        }

        const { role } = parsed.data;
        const res = NextResponse.json({ success: true, role });

        // Update legacy mes_role cookie for components that still read it
        res.cookies.set('mes_role', role, { path: '/', httpOnly: false, sameSite: 'lax' });

        // If there's an existing session, we can't change its role without re-issuing
        // (roles come from the DB — this is demo-only role switching)
        const existingToken = request.cookies.get(SESSION_COOKIE)?.value;
        if (existingToken) {
            const session = verifySessionToken(existingToken);
            if (session) {
                // Re-issue token with new demo role
                const newToken = createSessionToken({ userId: session.userId, username: session.username, role });
                res.cookies.set(SESSION_COOKIE, newToken, COOKIE_OPTIONS);
            }
        }

        return res;
    } catch {
        return NextResponse.json({ success: false }, { status: 400 });
    }
}
