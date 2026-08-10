import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const UpdateRoutingSchema = z.object({
    description: z.string().nullable().optional(),
    revision:    z.string().optional(),
    isActive:    z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'MAINTENANCE']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const routing = await prisma.routing.findUnique({
            where: { id },
            include: {
                product:    { select: { id: true, sku: true, name: true, isActive: true } },
                operations: { orderBy: { sequence: 'asc' } },
                _count:     { select: { workOrders: true } },
            },
        });
        if (!routing) return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
        return NextResponse.json(routing);
    } catch (err) {
                return handleApiError('[GET /api/routing/[id]]', err);
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const body   = await req.json();
        const parsed = UpdateRoutingSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const routing = await prisma.routing.update({ where: { id }, data: parsed.data });
        return NextResponse.json(routing);
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
                return handleApiError('[PUT /api/routing/[id]]', err);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const routing = await prisma.routing.findUnique({
            where: { id },
            select: { _count: { select: { workOrders: true } } },
        });
        if (!routing) return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
        if (routing._count.workOrders > 0) {
            return NextResponse.json({ error: 'Cannot deactivate routing with linked work orders' }, { status: 409 });
        }
        await prisma.routing.update({ where: { id }, data: { isActive: false } });
        return NextResponse.json({ success: true });
    } catch (err) {
                return handleApiError('[DELETE /api/routing/[id]]', err);
    }
}
