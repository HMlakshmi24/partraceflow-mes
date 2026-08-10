import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const OperationSchema = z.object({
    operationCode:         z.string().min(1).max(50),
    operationName:         z.string().min(1).max(200),
    sequence:              z.number().int().positive(),
    machineCapabilityType: z.string().min(1),
    estimatedCycleTime:    z.number().positive(),
    setupTime:             z.number().min(0).default(0),
    inspectionRequired:    z.boolean().default(false),
    requiredSkill:         z.string().nullable().optional(),
});

const CreateRoutingSchema = z.object({
    productId:   z.string().min(1),
    routingCode: z.string().min(1).max(50),
    description: z.string().nullable().optional(),
    revision:    z.string().default('A'),
    operations:  z.array(OperationSchema).min(1),
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
        const [total, routings] = await Promise.all([
            prisma.routing.count({ where }),
            prisma.routing.findMany({
                where,
                include: {
                    product:    { select: { id: true, sku: true, name: true } },
                    operations: { orderBy: { sequence: 'asc' } },
                    _count:     { select: { workOrders: true } },
                },
                orderBy: { routingCode: 'asc' },
                skip:    (page - 1) * pageSize,
                take:    pageSize,
            }),
        ]);
        return NextResponse.json({ routings, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (err) {
                return handleApiError('[GET /api/routing]', err);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    try {
        const body   = await req.json();
        const parsed = CreateRoutingSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const { productId, routingCode, description, revision, operations } = parsed.data;

        // Product must exist and be active
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { sku: true, isActive: true } });
        if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        if (!product.isActive) return NextResponse.json({ error: 'Cannot add routing to inactive product' }, { status: 422 });

        // Duplicate routingCode check
        const existing = await prisma.routing.findUnique({ where: { routingCode } });
        if (existing) return NextResponse.json({ error: `Routing code '${routingCode}' already exists` }, { status: 409 });

        // Sequence uniqueness
        const seqs = operations.map(op => op.sequence);
        if (new Set(seqs).size !== seqs.length) {
            return NextResponse.json({ error: 'Operation sequences must be unique within a routing' }, { status: 400 });
        }

        // Operation code uniqueness
        const codes = operations.map(op => op.operationCode);
        if (new Set(codes).size !== codes.length) {
            return NextResponse.json({ error: 'Operation codes must be unique within a routing' }, { status: 400 });
        }

        const routing = await prisma.routing.create({
            data: {
                productId,
                routingCode,
                description: description ?? null,
                revision,
                operations: {
                    create: operations.map(op => ({
                        operationCode:         op.operationCode,
                        operationName:         op.operationName,
                        sequence:              op.sequence,
                        machineCapabilityType: op.machineCapabilityType,
                        estimatedCycleTime:    op.estimatedCycleTime,
                        setupTime:             op.setupTime,
                        inspectionRequired:    op.inspectionRequired,
                        requiredSkill:         op.requiredSkill ?? null,
                    })),
                },
            },
            include: { operations: { orderBy: { sequence: 'asc' } } },
        });
        return NextResponse.json(routing, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/routing]', err);
    }
}
