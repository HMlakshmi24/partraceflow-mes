import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const UpdateBOMSchema = z.object({
    description: z.string().nullable().optional(),
    isActive:    z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'MAINTENANCE']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const bom = await prisma.billOfMaterial.findUnique({
            where: { id },
            include: {
                product: { select: { id: true, sku: true, name: true, isActive: true } },
                items:   { orderBy: { componentCode: 'asc' } },
            },
        });
        if (!bom) return NextResponse.json({ error: 'BOM not found' }, { status: 404 });
        return NextResponse.json(bom);
    } catch (err) {
                return handleApiError('[GET /api/bom/[id]]', err);
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const body   = await req.json();
        const parsed = UpdateBOMSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const bom = await prisma.billOfMaterial.update({ where: { id }, data: parsed.data });
        return NextResponse.json(bom);
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'BOM not found' }, { status: 404 });
                return handleApiError('[PUT /api/bom/[id]]', err);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const bom = await prisma.billOfMaterial.findUnique({ where: { id }, select: { isActive: true } });
        if (!bom) return NextResponse.json({ error: 'BOM not found' }, { status: 404 });
        // Soft-delete: mark inactive
        await prisma.billOfMaterial.update({ where: { id }, data: { isActive: false } });
        return NextResponse.json({ success: true });
    } catch (err) {
                return handleApiError('[DELETE /api/bom/[id]]', err);
    }
}
