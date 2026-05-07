import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { hashPassword } from '@/lib/auth';

/**
 * GET  /api/setup — check whether initial setup is needed
 * POST /api/setup — create first admin user if no users exist yet
 *
 * This endpoint is PUBLIC so you can bootstrap a fresh deployment.
 * It is a no-op (returns 409) if any user already exists.
 */

export async function GET() {
    try {
        const [userCount, dbOk] = await Promise.all([
            prisma.user.count(),
            prisma.user.findFirst({ select: { id: true } }).then(() => true).catch(() => false),
        ]);
        return NextResponse.json({
            needsSetup: userCount === 0,
            dbConnected: dbOk,
            userCount,
        });
    } catch (e) {
        return NextResponse.json({ error: 'Database unreachable', detail: (e as Error).message }, { status: 503 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const userCount = await prisma.user.count();
        if (userCount > 0) {
            return NextResponse.json({ error: 'Setup already completed. Users already exist.' }, { status: 409 });
        }

        const body = await req.json().catch(() => ({}));
        const adminPassword = (body.password as string) || process.env.DEMO_ADMIN_PASSWORD || 'admin123';
        const adminUsername = (body.username as string) || 'admin';

        const admin = await prisma.user.create({
            data: {
                username: adminUsername,
                role: 'ADMIN',
                isActive: true,
                passwordHash: hashPassword(adminPassword),
            },
        });

        return NextResponse.json({
            success: true,
            message: `Admin user "${admin.username}" created. You can now log in.`,
            username: admin.username,
        });
    } catch (e) {
        console.error('[setup]', e);
        return NextResponse.json({ error: 'Setup failed', detail: (e as Error).message }, { status: 500 });
    }
}
