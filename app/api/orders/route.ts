import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { createLogger } from '@/lib/logger';

const log = createLogger('orders');
import { getManufacturingOrders, getProducts } from '@/lib/actions/erp';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/services/database';
import { CreateWorkOrderSchema, validationError } from '@/lib/validation';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { fkProduct, fkMachine, fkShift, fkOperator } from '@/lib/fkValidation';

/**
 * Orders API
 *
 * GET  â€” returns products and manufacturing orders for the Planner UI.
 * POST â€” creates a new work order with FK validation on all FK fields.
 */
export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR', 'QC', 'QUALITY']);
    if (authError) return authError;

    try {
        const [products, orders, machines] = await Promise.all([
            getProducts(),
            getManufacturingOrders(),
            prisma.machine.findMany({ select: { id: true, code: true, name: true, status: true }, orderBy: { code: 'asc' } }),
        ]);

        return NextResponse.json({ products, orders, machines });
    } catch (error) {
                return handleApiError('[GET /api/orders]', error);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const body = await req.json();
        const parsed = CreateWorkOrderSchema.safeParse(body);
        if (!parsed.success) return validationError(parsed.error);

        // â”€â”€ FK validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const productErr = await fkProduct(parsed.data.productId);
        if (productErr) return NextResponse.json({ error: productErr, code: 'FK_INVALID' }, { status: 422 });

        if (parsed.data.machineId) {
            const machErr = await fkMachine(parsed.data.machineId);
            if (machErr) return NextResponse.json({ error: machErr, code: 'FK_INVALID' }, { status: 422 });
        }
        if (parsed.data.shiftId) {
            const shiftErr = await fkShift(parsed.data.shiftId);
            if (shiftErr) return NextResponse.json({ error: shiftErr, code: 'FK_INVALID' }, { status: 422 });
        }
        if (parsed.data.operatorId) {
            const opErr = await fkOperator(parsed.data.operatorId);
            if (opErr) return NextResponse.json({ error: opErr, code: 'FK_INVALID' }, { status: 422 });
        }

        const performedBy = req.headers.get('x-mes-username') ?? 'system';
        const role        = req.headers.get('x-mes-role') ?? 'SYSTEM';
        const userId      = req.headers.get('x-mes-user-id') ?? undefined;

        const order = await prisma.workOrder.create({
            data: {
                ...parsed.data,
                dueDate:        new Date(parsed.data.dueDate),
                scheduledStart: parsed.data.scheduledStart ? new Date(parsed.data.scheduledStart) : undefined,
                scheduledEnd:   parsed.data.scheduledEnd   ? new Date(parsed.data.scheduledEnd)   : undefined,
            },
            include: { product: true, machine: true, shift: true },
        });

        await OrderLifecycleService.recordOrderCreated({
            orderId:     order.id,
            orderNumber: order.orderNumber,
            performedBy,
            role,
            userId,
            notes: `Work order ${order.orderNumber} created`,
        });

        return NextResponse.json({ order }, { status: 201 });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return NextResponse.json({ error: 'Order number already exists', code: 'DUPLICATE' }, { status: 409 });
        }
        return handleApiError('POST /api/orders', error);
    }
}
