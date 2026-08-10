import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { verifyPassword } from '@/lib/auth';
import { generateBackupCodes, hashBackupCodes } from '@/lib/mfa';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/getClientIp';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/mfa/regenerate-backup-codes');
const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

/**
 * POST /api/auth/mfa/regenerate-backup-codes
 *
 * Settings-page action for an already fully-verified session (proxy.ts only
 * lets fully-verified traffic reach paths outside MFA_SETUP_PATHS /
 * MFA_VERIFY_PATHS, and this route isn't in either). Requires re-entering
 * the account password — a valid session cookie alone shouldn't be enough
 * to invalidate someone's existing recovery codes and mint new ones.
 * Invalidates every previously-issued code.
 */
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ALL_ROLES);
    if (authError) return authError;

    const session = getRequestSession(req)!;
    const ip = getClientIp(req);

    const rl = await rateLimit(`mfa-regen:${session.userId}`, { limit: 5, windowMs: 15 * 60 * 1000 });
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
            select: { id: true, username: true, passwordHash: true, mfaEnabled: true },
        });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (!user.mfaEnabled) return NextResponse.json({ error: 'MFA is not enabled on this account' }, { status: 400 });

        if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
            AuditService.log(EventType.MFA_FAILED, `Backup-code regeneration denied for "${user.username}" — wrong password`, { username: user.username, ip }, user.id).catch(() => {});
            return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
        }

        const backupCodes = generateBackupCodes();
        await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: hashBackupCodes(backupCodes) } });

        AuditService.log(EventType.MFA_BACKUP_CODES_REGENERATED, `MFA backup codes regenerated for "${user.username}"`, { username: user.username, ip }, user.id).catch(() => {});

        return NextResponse.json({ success: true, backupCodes });
    } catch (error) {
        log.error('MFA backup code regeneration failed', { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'Unavailable. Please try again later.' }, { status: 503 });
    }
}
