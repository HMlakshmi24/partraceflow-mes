import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { SESSION_COOKIE, createSessionToken, getCookieOptions } from '@/lib/auth';
import { decryptMfaSecret, verifyTotp } from '@/lib/mfa';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/getClientIp';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/mfa/validate');
const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

/**
 * POST /api/auth/mfa/validate
 *
 * The login-time second factor for accounts that already completed
 * enrollment (mfaEnabled=true). Reachable while mfaVerified=false because
 * proxy.ts lists it in MFA_VERIFY_PATHS. Tightly rate-limited per-account —
 * unlike enrollment, this endpoint is the actual brute-force target for an
 * attacker who already has the password.
 */
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ALL_ROLES);
    if (authError) return authError;

    const session = getRequestSession(req)!;
    const ip = getClientIp(req);

    const rl = await rateLimit(`mfa-validate:${session.userId}`, { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
        AuditService.log(EventType.AUTH_RATE_LIMITED, `MFA validation rate limit exceeded for user ${session.userId}`, { ip }, session.userId).catch(() => {});
        return NextResponse.json(
            { error: 'Too many attempts. Try again later.' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
    }

    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token) return NextResponse.json({ error: 'Verification code is required' }, { status: 400 });

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: {
                id: true, username: true, role: true, mustChangePassword: true, sessionVersion: true,
                mfaSecret: true, mfaEnabled: true,
            },
        });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (!user.mfaEnabled || !user.mfaSecret) {
            return NextResponse.json({ error: 'MFA is not enabled on this account' }, { status: 400 });
        }

        const secret = decryptMfaSecret(user.mfaSecret);
        if (!secret || !verifyTotp(secret, token)) {
            AuditService.log(EventType.MFA_FAILED, `MFA login verification failed for "${user.username}"`, { username: user.username, ip }, user.id).catch(() => {});
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
        }

        AuditService.log(EventType.MFA_VERIFIED, `MFA login verified for "${user.username}"`, { username: user.username, ip }, user.id).catch(() => {});

        const newToken = createSessionToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
            sessionVersion: user.sessionVersion,
            mfaEnabled: true,
            mfaVerified: true,
        });

        const res = NextResponse.json({ success: true });
        res.cookies.set(SESSION_COOKIE, newToken, getCookieOptions(user.role));
        return res;
    } catch (error) {
        log.error('MFA validate failed', { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'MFA verification unavailable. Please try again later.' }, { status: 503 });
    }
}
