import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { SESSION_COOKIE, createSessionToken, getCookieOptions } from '@/lib/auth';
import { decryptMfaSecret, verifyTotp, generateBackupCodes, hashBackupCodes } from '@/lib/mfa';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/getClientIp';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/mfa/verify');
const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

/**
 * POST /api/auth/mfa/verify
 *
 * Confirms enrollment: proves the user actually captured the secret in an
 * authenticator app by requiring one valid code against the pending
 * (unconfirmed) secret written by /api/auth/mfa/setup. On success, flips
 * mfaEnabled=true, mints backup codes (shown exactly once — only the hash is
 * kept), and reissues the session token with mfaVerified=true so the user
 * lands in the app immediately without a second login.
 */
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ALL_ROLES);
    if (authError) return authError;

    const session = getRequestSession(req)!;
    const ip = getClientIp(req);

    const rl = await rateLimit(`mfa-verify:${session.userId}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
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
        if (user.mfaEnabled) return NextResponse.json({ error: 'MFA is already enabled' }, { status: 409 });
        if (!user.mfaSecret) return NextResponse.json({ error: 'No pending enrollment. Call /api/auth/mfa/setup first.' }, { status: 400 });

        const secret = decryptMfaSecret(user.mfaSecret);
        if (!secret || !verifyTotp(secret, token)) {
            AuditService.log(EventType.MFA_FAILED, `MFA enrollment verification failed for "${user.username}"`, { username: user.username, ip }, user.id).catch(() => {});
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
        }

        const backupCodes = generateBackupCodes();
        await prisma.user.update({
            where: { id: user.id },
            data: {
                mfaEnabled: true,
                mfaEnrolledAt: new Date(),
                mfaBackupCodes: hashBackupCodes(backupCodes),
            },
        });

        AuditService.log(EventType.MFA_ENROLLED, `MFA enabled for "${user.username}"`, { username: user.username, ip }, user.id).catch(() => {});

        const newToken = createSessionToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
            sessionVersion: user.sessionVersion,
            mfaEnabled: true,
            mfaVerified: true,
        });

        const res = NextResponse.json({ success: true, backupCodes });
        res.cookies.set(SESSION_COOKIE, newToken, getCookieOptions(user.role));
        return res;
    } catch (error) {
        log.error('MFA verify failed', { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'MFA verification unavailable. Please try again later.' }, { status: 503 });
    }
}
