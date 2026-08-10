import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const CreateProductSchema = z.object({
    sku:             z.string().min(1).max(50),
    name:            z.string().min(1).max(200),
    description:     z.string().nullable().optional(),
    revision:        z.string().default('A'),
    unitOfMeasure:   z.string().default('EA'),
    productType:     z.enum(['FINISHED_GOOD', 'SEMI_FINISHED', 'RAW_MATERIAL', 'COMPONENT']).default('FINISHED_GOOD'),
    isActive:        z.boolean().default(true),
    defaultBatchSize: z.number().int().positive().nullable().optional(),
});

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'MAINTENANCE']);
    if (authError) return authError;

    const sp          = new URL(req.url).searchParams;
    const search      = sp.get('search') ?? undefined;
    const productType = sp.get('productType') ?? undefined;
    const isActive    = sp.get('isActive');
    const page        = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
    const pageSize    = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '50', 10)));

    const where: any = {};
    if (search) {
        where.OR = [
            { sku:  { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
        ];
    }
    if (productType) where.productType = productType;
    if (isActive !== null && isActive !== undefined) where.isActive = isActive !== 'false';

    try {
        const [total, products] = await Promise.all([
            prisma.product.count({ where }),
            prisma.product.findMany({
                where,
                orderBy: { sku: 'asc' },
                skip:    (page - 1) * pageSize,
                take:    pageSize,
                select: {
                    id: true, sku: true, name: true, description: true,
                    revision: true, unitOfMeasure: true, productType: true,
                    isActive: true, defaultBatchSize: true,
                    createdAt: true, updatedAt: true,
                    _count: { select: { workOrders: true, boms: true, routings: true } },
                },
            }),
        ]);

        return NextResponse.json({
            products,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        });
    } catch (err) {
                return handleApiError('[GET /api/products]', err);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    try {
        const body   = await req.json();
        const parsed = CreateProductSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const existing = await prisma.product.findUnique({ where: { sku: parsed.data.sku } });
        if (existing) {
            return NextResponse.json({ error: `Product SKU '${parsed.data.sku}' already exists` }, { status: 409 });
        }

        const product = await prisma.product.create({ data: parsed.data });
        return NextResponse.json(product, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/products]', err);
    }
}
