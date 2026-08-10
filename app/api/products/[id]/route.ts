import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const UpdateProductSchema = z.object({
    name:             z.string().min(1).max(200).optional(),
    description:      z.string().nullable().optional(),
    revision:         z.string().optional(),
    unitOfMeasure:    z.string().optional(),
    productType:      z.enum(['FINISHED_GOOD', 'SEMI_FINISHED', 'RAW_MATERIAL', 'COMPONENT']).optional(),
    isActive:         z.boolean().optional(),
    defaultBatchSize: z.number().int().positive().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'MAINTENANCE']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
                boms:    { include: { items: true }, orderBy: { revision: 'asc' } },
                routings: { include: { operations: { orderBy: { sequence: 'asc' } } }, orderBy: { routingCode: 'asc' } },
                _count:  { select: { workOrders: true, lots: true } },
            },
        });
        if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        return NextResponse.json(product);
    } catch (err) {
                return handleApiError('[GET /api/products/[id]]', err);
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const body   = await req.json();
        const parsed = UpdateProductSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const product = await prisma.product.update({ where: { id }, data: parsed.data });
        return NextResponse.json(product);
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
                return handleApiError('[PUT /api/products/[id]]', err);
    }
}
