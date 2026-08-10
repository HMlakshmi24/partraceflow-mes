import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';
import { calcMaterialVariance, calcVariancePct, calcScrapPct } from '@/lib/services/ProductMasterService';

const CreateConsumptionSchema = z.object({
    workOrderId:     z.string().min(1),
    productId:       z.string().min(1),
    componentCode:   z.string().min(1),
    plannedQuantity: z.number().positive(),
    actualQuantity:  z.number().min(0).default(0),
    scrapQuantity:   z.number().min(0).default(0),
    issuedBy:        z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'MAINTENANCE']);
    if (authError) return authError;

    const sp          = new URL(req.url).searchParams;
    const workOrderId = sp.get('workOrderId') ?? undefined;
    const productId   = sp.get('productId') ?? undefined;
    const page        = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
    const pageSize    = Math.min(200, Math.max(1, parseInt(sp.get('pageSize') ?? '50', 10)));

    const where: any = {};
    if (workOrderId) where.workOrderId = workOrderId;
    if (productId)   where.productId   = productId;

    try {
        const [total, records] = await Promise.all([
            prisma.materialConsumption.count({ where }),
            prisma.materialConsumption.findMany({
                where,
                include: {
                    workOrder: { select: { id: true, orderNumber: true, status: true } },
                    product:   { select: { id: true, sku: true, name: true } },
                },
                orderBy: { issuedAt: 'desc' },
                skip:    (page - 1) * pageSize,
                take:    pageSize,
            }),
        ]);

        // Enrich with computed variance fields
        const enriched = records.map(r => ({
            ...r,
            variance:    calcMaterialVariance(r.plannedQuantity, r.actualQuantity),
            variancePct: calcVariancePct(r.plannedQuantity, r.actualQuantity),
            scrapPct:    calcScrapPct(r.scrapQuantity, r.actualQuantity),
        }));

        // Work-order-level summary when filtering by workOrderId
        let summary = null;
        if (workOrderId) {
            const totalPlanned = records.reduce((s, r) => s + r.plannedQuantity, 0);
            const totalActual  = records.reduce((s, r) => s + r.actualQuantity, 0);
            const totalScrap   = records.reduce((s, r) => s + r.scrapQuantity, 0);
            summary = {
                totalPlanned,
                totalActual,
                totalScrap,
                variance:    calcMaterialVariance(totalPlanned, totalActual),
                variancePct: calcVariancePct(totalPlanned, totalActual),
                scrapPct:    calcScrapPct(totalScrap, totalActual),
            };
        }

        return NextResponse.json({
            records: enriched,
            summary,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        });
    } catch (err) {
                return handleApiError('[GET /api/material-consumption]', err);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR']);
    if (authError) return authError;

    try {
        const body   = await req.json();
        const parsed = CreateConsumptionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const { workOrderId, productId } = parsed.data;

        // Verify work order exists and is in an active state
        const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
        if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
        if (!['RELEASED', 'IN_PROGRESS'].includes(wo.status)) {
            return NextResponse.json({ error: `Cannot issue material to work order with status ${wo.status}` }, { status: 422 });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { sku: true } });
        if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

        const issuedBy = req.headers.get('x-mes-username') ?? parsed.data.issuedBy ?? null;
        const record = await prisma.materialConsumption.create({
            data: { ...parsed.data, issuedBy },
        });
        return NextResponse.json(record, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/material-consumption]', err);
    }
}
