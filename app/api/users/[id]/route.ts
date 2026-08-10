import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession, invalidateSessionLivenessCache } from '@/lib/api-auth';
import { z } from 'zod';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { VALID_ROLES } from '@/app/api/users/route';

const UpdateUserSchema = z.object({
    role:               z.enum(VALID_ROLES).optional(),
    email:              z.string().email().nullable().optional(),
    displayName:        z.string().min(1).max(100).nullable().optional(),
    employeeId:         z.string().nullable().optional(),
    plantId:            z.string().nullable().optional(),
    isActive:           z.boolean().optional(),
    mustChangePassword: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true, username: true, role: true, isActive: true,
                email: true, displayName: true, employeeId: true, plantId: true,
                mustChangePassword: true, lastLoginAt: true, createdAt: true, sessionVersion: true,
            },
        });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        return NextResponse.json(user);
    } catch (err) {
                return handleApiError('[GET /api/users/[id]]', err);
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const session    = getRequestSession(req);
    const { id }     = await params;

    try {
        const body   = await req.json();
        const parsed = UpdateUserSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const before = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true, username: true, role: true, isActive: true,
                email: true, displayName: true, mustChangePassword: true,
            },
        });
        if (!before) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Prevent self-deactivation
        if (parsed.data.isActive === false && session?.userId === id) {
            return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 422 });
        }

        const updateData: any = { ...parsed.data };
        // Revoke all active sessions when deactivating
        if (parsed.data.isActive === false) {
            updateData.sessionVersion = { increment: 1 };
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true, username: true, role: true, isActive: true,
                email: true, displayName: true, mustChangePassword: true, sessionVersion: true,
            },
        });
        invalidateSessionLivenessCache(id);

        const eventType = parsed.data.isActive === false
            ? EventType.USER_DEACTIVATED
            : parsed.data.isActive === true
                ? EventType.USER_ACTIVATED
                : EventType.USER_UPDATED;

        await AuditService.logChange({
            action: eventType,
            entity: 'User',
            entityId: id,
            before: {
                role:               before.role,
                isActive:           before.isActive,
                email:              before.email,
                displayName:        before.displayName,
                mustChangePassword: before.mustChangePassword,
            },
            after: {
                role:               user.role,
                isActive:           user.isActive,
                email:              user.email,
                displayName:        user.displayName,
                mustChangePassword: user.mustChangePassword,
            },
            userId:       session?.userId,
            performedBy:  session?.username,
            role:         session?.role,
        });

        return NextResponse.json(user);
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'User not found' }, { status: 404 });
                return handleApiError('[PUT /api/users/[id]]', err);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const session = getRequestSession(req);
    const { id }  = await params;

    if (session?.userId === id) {
        return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 422 });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id }, select: { username: true, role: true } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        await prisma.user.update({
            where: { id },
            data: { isActive: false, sessionVersion: { increment: 1 } },
        });
        invalidateSessionLivenessCache(id);

        await AuditService.log(
            EventType.USER_DEACTIVATED,
            `User deactivated: ${user.username}`,
            { targetUsername: user.username, targetId: id },
            session?.userId,
        );

        return NextResponse.json({ success: true });
    } catch (err) {
                return handleApiError('[DELETE /api/users/[id]]', err);
    }
}
