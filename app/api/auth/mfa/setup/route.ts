import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { generateTotpSecret, generateOtpAuthUri, encryptMfaSecret } from '@/lib/mfa';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { getClientIp } from '@/lib/utils/getClientIp';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/mfa/setup');
const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

/**
 * POST /api/auth/mfa/setup
 *
 * Starts (or restarts) TOTP enrollment for the currently-authenticated user.
 * Reachable while MFA is unconfirmed because proxy.ts lists it in
 * MFA_SETUP_PATHS. Generates a new pending secret every call — harmless
 * while mfaEnabled is still false (the old pending secret was never
 * confirmed anyway), but refused outright once mfaEnabled is true, so a
 * hijacked session can't silently swap out a working MFA enrollment. Use
 * /api/auth/mfa/disable (which requires the current password) to reset an
 * already-enabled account first.
 */
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ALL_ROLES);
    if (authError) return authError;

    const session = getRequestSession(req)!;

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { id: true, username: true, mfaEnabled: true },
        });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        if (user.mfaEnabled) {
            return NextResponse.json(
                { error: 'MFA is already enabled on this account. Disable it first to re-enroll.' },
                { status: 409 }
            );
        }

        const secret = generateTotpSecret();
        await prisma.user.update({
            where: { id: user.id },
            data: { mfaSecret: encryptMfaSecret(secret) },
        });

        const otpauthUri = generateOtpAuthUri(secret, user.username);
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

        AuditService.log(
            EventType.AUDIT_CHANGE,
            `MFA enrollment started for "${user.username}"`,
            { username: user.username, ip: getClientIp(req) },
            user.id,
        ).catch(() => {});

        return NextResponse.json({
            secret,
            otpauthUri,
            qrCodeDataUrl,
        });
    } catch (error) {
        log.error('MFA setup failed', { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'MFA setup unavailable. Please try again later.' }, { status: 503 });
    }
}
