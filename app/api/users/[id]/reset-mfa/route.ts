import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession, invalidateSessionLivenessCache } from '@/lib/api-auth';
import { AuditService, EventType } from '@/lib/services/AuditService';

/**
 * POST /api/users/[id]/reset-mfa
 *
 * Admin-only recovery path for a locked-out user (lost/wiped authenticator
 * device and exhausted their backup codes). MFA is mandatory for every
 * account in this deployment, so there is deliberately no self-service "turn
 * MFA off" outside of re-enrolling — this is the only way to clear a broken
 * enrollment without the user's own password or device.
 *
 * Clears mfaEnabled/mfaSecret/mfaBackupCodes and bumps sessionVersion (same
 * pattern as reset-password) so any existing session token — which may
 * still carry mfaEnabled=true / mfaVerified=true — is invalidated
 * immediately rather than waiting out its natural expiry. The user's next
 * login reads the now-cleared mfaEnabled=false from the DB and proxy.ts's
 * mandatory-MFA gate routes them straight to /mfa-setup.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const session = getRequestSession(req);
    const { id } = await params;

    try {
        const user = await prisma.user.findUnique({ where: { id }, select: { username: true, mfaEnabled: true } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        await prisma.user.update({
            where: { id },
            data: {
                mfaEnabled: false,
                mfaSecret: null,
                mfaBackupCodes: null,
                mfaEnrolledAt: null,
                sessionVersion: { increment: 1 },
            },
        });
        invalidateSessionLivenessCache(id);

        await AuditService.log(
            EventType.MFA_ADMIN_RESET,
            `MFA reset by admin for: ${user.username}`,
            { targetUsername: user.username, targetId: id, previouslyEnabled: user.mfaEnabled },
            session?.userId,
        );

        return NextResponse.json({ success: true });
    } catch (err) {
        return handleApiError('[POST /api/users/[id]/reset-mfa]', err);
    }
}
