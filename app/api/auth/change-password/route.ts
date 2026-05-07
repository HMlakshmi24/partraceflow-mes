import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { hashPassword, verifySessionToken, SESSION_COOKIE, COOKIE_OPTIONS } from '@/lib/auth';
import { z } from 'zod';
import { AuditService, EventType } from '@/lib/services/AuditService';

const ChangePasswordSchema = z.object({
    oldPassword: z.string().min(1, 'Old password required'),
    newPassword: z.string()
        .min(12, 'Password must be at least 12 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[\W_]/, 'Password must contain at least one symbol'),
});

const WEAK_PASSWORDS = new Set(['admin123', 'demo', 'password123', 'test1234']);

export async function POST(req: NextRequest) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? verifySessionToken(token) : null;

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({
            error: 'Validation failed',
            details: parsed.error.issues.map(i => i.message).join(', ')
        }, { status: 400 });
    }

    const { newPassword } = parsed.data;

    // Check for common weak passwords
    if (WEAK_PASSWORDS.has(newPassword.toLowerCase())) {
        return NextResponse.json({ error: 'Password is too common or weak' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: session.userId } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Update password and clear mustChangePassword
        const passwordHash = hashPassword(newPassword);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                mustChangePassword: false
            }
        });

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown';
        await AuditService.logChange({
            action: 'Changed Password',
            entity: 'User',
            entityId: user.id,
            before: { mustChangePassword: user.mustChangePassword },
            after: { mustChangePassword: false },
            userId: user.id,
            performedBy: user.username,
            role: user.role
        });

        return NextResponse.json({ success: true, message: 'Password updated successfully' });
    } catch (e) {
        return NextResponse.json({ error: 'Server error updating password' }, { status: 500 });
    }
}
