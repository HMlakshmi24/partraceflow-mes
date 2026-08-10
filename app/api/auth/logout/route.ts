import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { requireRole } from '@/lib/api-auth';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, ALL_ROLES);
    if (authError) return authError;
    const body = await request.json().catch(() => ({} as { reason?: string }));
    const reason = typeof body.reason === 'string' ? body.reason : 'user_logout';
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = token ? verifySessionToken(token) : null;
    if (session) {
        await AuditService.log(
            EventType.AUTH_LOGOUT,
            `User ${session.username} logged out`,
            { reason, role: session.role },
            session.userId,
        ).catch(() => {});
    }

    const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
    
    // Invalidate the session cookie immediately.
    res.cookies.set(SESSION_COOKIE, '', { path: '/', httpOnly: true, maxAge: 0, expires: new Date(0) });

    // Prevent back-button from restoring authenticated state from browser cache
    res.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"');
    res.headers.set('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
    
    return res;
}
