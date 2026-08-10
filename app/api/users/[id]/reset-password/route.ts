import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession, invalidateSessionLivenessCache } from '@/lib/api-auth';
import { hashPassword } from '@/lib/auth';
import { z } from 'zod';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { StrongPasswordSchema } from '@/lib/validation';

const ResetSchema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('force_change') }),
    z.object({
        mode:        z.literal('set_password'),
        newPassword: StrongPasswordSchema,
    }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const session = getRequestSession(req);
    const { id }  = await params;

    try {
        const body   = await req.json();
        const parsed = ResetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { id }, select: { username: true } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const data: any = {
            mustChangePassword: true,
            sessionVersion:     { increment: 1 }, // invalidate all active sessions
        };

        if (parsed.data.mode === 'set_password') {
            data.passwordHash = hashPassword(parsed.data.newPassword);
        }

        await prisma.user.update({ where: { id }, data });
        invalidateSessionLivenessCache(id);

        await AuditService.log(
            EventType.USER_PASSWORD_RESET,
            `Password reset for: ${user.username} (mode: ${parsed.data.mode})`,
            { targetUsername: user.username, targetId: id, mode: parsed.data.mode },
            session?.userId,
        );

        return NextResponse.json({ success: true });
    } catch (err) {
                return handleApiError('[POST /api/users/[id]/reset-password]', err);
    }
}
