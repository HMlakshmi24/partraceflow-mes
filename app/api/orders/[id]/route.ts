import { NextRequest, NextResponse } from 'next/server';
import { STATUS_LABELS } from '@/lib/orderStateMachine';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { prisma } from '@/lib/services/database';

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
              orderBy: { startTime: 'asc' },
            },
          },
        },
      },
    });
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      ...order,
      nextActions: OrderLifecycleService.getAllowedNextStatuses(order.status),
      isDelayed: ['RELEASED', 'IN_PROGRESS', 'QC_PENDING'].includes(order.status) && new Date(order.dueDate) < new Date(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const newStatus = body.status;
    const notes = body.notes;

    const allStatuses = Object.keys({
      PLANNED: 1,
      RELEASED: 1,
      IN_PROGRESS: 1,
      QC_PENDING: 1,
      APPROVED: 1,
      REWORK: 1,
      ON_HOLD: 1,
      COMPLETED: 1,
      CANCELLED: 1,
    });
    if (!allStatuses.includes(newStatus)) {
      return NextResponse.json({ error: `Invalid status: "${newStatus}"` }, { status: 400 });
    }

    const performedBy = req.headers.get('x-mes-username') ?? 'system';
    const role = req.headers.get('x-mes-role') ?? 'SYSTEM';
    const userId = req.headers.get('x-mes-user-id') ?? undefined;

    const order = await OrderLifecycleService.transitionOrder({
      orderId: id,
      newStatus,
      performedBy,
      role,
      userId,
      notes,
    });

    return NextResponse.json({
      ...order,
      statusLabel: STATUS_LABELS[order.status] ?? order.status,
      nextActions: OrderLifecycleService.getAllowedNextStatuses(order.status, role),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed';
    const status = /Role .* cannot set order/i.test(message) ? 403 : /Cannot move from|Order is/i.test(message) ? 422 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
