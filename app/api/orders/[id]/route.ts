import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { canTransition, getTransitionError, STATUS_LABELS } from '@/lib/orderStateMachine';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const order = await prisma.workOrder.findUnique({
            where: { id },
            include: {
                product: true,
                activities: { orderBy: { timestamp: 'asc' } },
                workflowInstances: {
                    include: {
                        tasks: {
                            include: { stepDef: true, operator: true, machine: true },
                            orderBy: { startTime: 'asc' }
                        }
                    }
                }
            }
        });
        if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(order);
    } catch {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const body = await req.json();
        const { status: newStatus, notes } = body;

        const allStatuses = Object.keys({
            PLANNED: 1, RELEASED: 1, IN_PROGRESS: 1, QC_PENDING: 1,
            APPROVED: 1, REWORK: 1, ON_HOLD: 1, COMPLETED: 1, CANCELLED: 1
        });
        if (!allStatuses.includes(newStatus)) {
            return NextResponse.json({ error: `Invalid status: "${newStatus}"` }, { status: 400 });
        }

        // Read current order
        const current = await prisma.workOrder.findUnique({ where: { id } });
        if (!current) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        // Enforce state machine
        if (!canTransition(current.status, newStatus)) {
            return NextResponse.json(
                { error: getTransitionError(current.status, newStatus) },
                { status: 422 }
            );
        }

        // Read user from middleware-injected headers
        const performedBy = req.headers.get('x-mes-username') ?? 'system';
        const role        = req.headers.get('x-mes-role')     ?? 'SYSTEM';

        // Update order + log activity in one transaction
        const [order] = await prisma.$transaction([
            prisma.workOrder.update({ where: { id }, data: { status: newStatus } }),
            prisma.orderActivity.create({
                data: {
                    orderId:     id,
                    action:      'STATUS_CHANGE',
                    fromStatus:  current.status,
                    toStatus:    newStatus,
                    performedBy,
                    role,
                    notes: notes ?? `Status changed from ${STATUS_LABELS[current.status] ?? current.status} to ${STATUS_LABELS[newStatus] ?? newStatus}`,
                }
            }),
            prisma.systemEvent.create({
                data: {
                    eventType: 'ORDER_STATUS_CHANGE',
                    details: `[${performedBy}] Order ${current.orderNumber}: ${current.status} → ${newStatus}`,
                }
            }),
        ]);

        return NextResponse.json(order);
    } catch (e: any) {
        return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
    }
}
