import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { SESSION_COOKIE, createSessionToken, getCookieOptions } from '@/lib/auth';
import { verifyAndConsumeBackupCode } from '@/lib/mfa';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/getClientIp';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/mfa/backup');
const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

/**
 * POST /api/auth/mfa/backup
 *
 * Alternate second factor for a user who has their password but has lost
 * their authenticator device. Each code is single-use (removed from the
 * stored set on success — see lib/mfa.ts verifyAndConsumeBackupCode) and the
 * response flags when the account is running low so the UI can prompt a
 * regeneration via /api/auth/mfa/regenerate-backup-codes.
 */
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ALL_ROLES);
    if (authError) return authError;

    const session = getRequestSession(req)!;
    const ip = getClientIp(req);

    const rl = await rateLimit(`mfa-backup:${session.userId}`, { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
        AuditService.log(EventType.AUTH_RATE_LIMITED, `MFA backup-code rate limit exceeded for user ${session.userId}`, { ip }, session.userId).catch(() => {});
        return NextResponse.json(
            { error: 'Too many attempts. Try again later.' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
    }

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code) return NextResponse.json({ error: 'Backup code is required' }, { status: 400 });

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: {
                id: true, username: true, role: true, mustChangePassword: true, sessionVersion: true,
                mfaEnabled: true, mfaBackupCodes: true,
            },
        });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (!user.mfaEnabled || !user.mfaBackupCodes) {
            return NextResponse.json({ error: 'MFA is not enabled on this account' }, { status: 400 });
        }

        const { valid, remainingHashes } = verifyAndConsumeBackupCode(user.mfaBackupCodes, code);
        if (!valid) {
            AuditService.log(EventType.MFA_FAILED, `MFA backup code redemption failed for "${user.username}"`, { username: user.username, ip }, user.id).catch(() => {});
            return NextResponse.json({ error: 'Invalid or already-used backup code' }, { status: 401 });
        }

        await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: remainingHashes } });

        const remainingCount = (JSON.parse(remainingHashes) as string[]).length;
        AuditService.log(
            EventType.MFA_BACKUP_CODE_USED,
            `MFA backup code redeemed for "${user.username}" (${remainingCount} remaining)`,
            { username: user.username, ip, remainingCount },
            user.id,
        ).catch(() => {});

        const newToken = createSessionToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
            sessionVersion: user.sessionVersion,
            mfaEnabled: true,
            mfaVerified: true,
        });

        const res = NextResponse.json({ success: true, remainingCount, lowCodeWarning: remainingCount <= 2 });
        res.cookies.set(SESSION_COOKIE, newToken, getCookieOptions(user.role));
        return res;
    } catch (error) {
        log.error('MFA backup redemption failed', { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'MFA verification unavailable. Please try again later.' }, { status: 503 });
    }
}
