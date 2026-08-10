import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { SESSION_COOKIE, verifyPassword, createSessionToken, getCookieOptions } from '@/lib/auth';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/getClientIp';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/mfa/disable');
const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

/**
 * POST /api/auth/mfa/disable
 *
 * Clears an account's MFA enrollment (secret + backup codes), gated behind
 * re-entering the password. MFA is mandatory for every role in this
 * deployment, so this is deliberately not a way to "turn MFA off" — the
 * reissued token carries mfaEnabled=false, which proxy.ts's gate reads as
 * "no enrollment yet" and immediately redirects the user's next request to
 * /mfa-setup. It exists only so a user can reset a broken/lost-device
 * enrollment and re-enroll from scratch, e.g. via /api/auth/mfa/setup.
 */
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ALL_ROLES);
    if (authError) return authError;

    const session = getRequestSession(req)!;
    const ip = getClientIp(req);

    const rl = await rateLimit(`mfa-disable:${session.userId}`, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Too many attempts. Try again later.' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
    }

    const body = await req.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password) return NextResponse.json({ error: 'Password is required' }, { status: 400 });

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { id: true, username: true, role: true, passwordHash: true, mustChangePassword: true, sessionVersion: true, mfaEnabled: true },
        });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
            AuditService.log(EventType.MFA_FAILED, `MFA disable denied for "${user.username}" — wrong password`, { username: user.username, ip }, user.id).catch(() => {});
            return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null, mfaEnrolledAt: null },
        });

        AuditService.log(EventType.MFA_DISABLED, `MFA disabled for "${user.username}" — re-enrollment required`, { username: user.username, ip }, user.id).catch(() => {});

        const newToken = createSessionToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
            sessionVersion: user.sessionVersion,
            mfaEnabled: false,
            mfaVerified: false,
        });

        const res = NextResponse.json({ success: true, reenrollmentRequired: true });
        res.cookies.set(SESSION_COOKIE, newToken, getCookieOptions(user.role));
        return res;
    } catch (error) {
        log.error('MFA disable failed', { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'Unavailable. Please try again later.' }, { status: 503 });
    }
}
