import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';
import { isBOMRecursive, validateBOMQuantity } from '@/lib/services/ProductMasterService';

const BOMItemSchema = z.object({
    componentCode: z.string().min(1),
    description:   z.string().nullable().optional(),
    quantity:      z.number().positive(),
    unitOfMeasure: z.string().default('EA'),
    scrapFactor:   z.number().min(0).max(0.99).nullable().optional(),
});

const CreateBOMSchema = z.object({
    productId:   z.string().min(1),
    revision:    z.string().default('A'),
    description: z.string().nullable().optional(),
    items:       z.array(BOMItemSchema).min(1),
});

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'MAINTENANCE']);
    if (authError) return authError;

    const sp        = new URL(req.url).searchParams;
    const productId = sp.get('productId') ?? undefined;
    const activeOnly = sp.get('active') !== 'false';
    const page       = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
    const pageSize   = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '50', 10)));

    const where: any = {};
    if (productId)  where.productId = productId;
    if (activeOnly) where.isActive  = true;

    try {
        const [total, boms] = await Promise.all([
            prisma.billOfMaterial.count({ where }),
            prisma.billOfMaterial.findMany({
                where,
                include: {
                    product: { select: { id: true, sku: true, name: true } },
                    items:   true,
                    _count:  { select: { items: true } },
                },
                orderBy: [{ productId: 'asc' }, { revision: 'asc' }],
                skip:    (page - 1) * pageSize,
                take:    pageSize,
            }),
        ]);
        return NextResponse.json({ boms, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (err) {
                return handleApiError('[GET /api/bom]', err);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    try {
        const body   = await req.json();
        const parsed = CreateBOMSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const { productId, revision, description, items } = parsed.data;

        // Product must exist and be active
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { sku: true, isActive: true } });
        if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        if (!product.isActive) return NextResponse.json({ error: 'Cannot add BOM to inactive product' }, { status: 422 });

        // Duplicate revision check
        const existing = await prisma.billOfMaterial.findUnique({ where: { productId_revision: { productId, revision } } });
        if (existing) {
            return NextResponse.json({ error: `BOM revision '${revision}' already exists for this product` }, { status: 409 });
        }

        // Validate items
        for (const item of items) {
            if (!validateBOMQuantity(item.quantity)) {
                return NextResponse.json({ error: `Component ${item.componentCode}: quantity must be > 0` }, { status: 400 });
            }
        }

        // Recursive BOM check: load all existing items
        const allExisting = await prisma.bOMItem.findMany({
            include: { bom: { select: { product: { select: { sku: true } } } } },
        });
        const flatItems = allExisting.map(i => ({
            parentCode:    i.bom.product.sku,
            componentCode: i.componentCode,
        }));

        for (const item of items) {
            if (isBOMRecursive(product.sku, item.componentCode, flatItems)) {
                return NextResponse.json(
                    { error: `Component '${item.componentCode}' would create a recursive BOM` },
                    { status: 422 },
                );
            }
        }

        // Duplicate component code within this BOM
        const codes = items.map(i => i.componentCode);
        if (new Set(codes).size !== codes.length) {
            return NextResponse.json({ error: 'Duplicate component codes within BOM' }, { status: 400 });
        }

        const bom = await prisma.billOfMaterial.create({
            data: {
                productId,
                revision,
                description: description ?? null,
                items: {
                    create: items.map(i => ({
                        componentCode: i.componentCode,
                        description:   i.description ?? null,
                        quantity:      i.quantity,
                        unitOfMeasure: i.unitOfMeasure,
                        scrapFactor:   i.scrapFactor ?? null,
                    })),
                },
            },
            include: { items: true },
        });
        return NextResponse.json(bom, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/bom]', err);
    }
}
