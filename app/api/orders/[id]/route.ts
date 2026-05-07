import { NextRequest, NextResponse } from 'next/server';
import { STATUS_LABELS } from '@/lib/orderStateMachine';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY']);
  if (authError) return authError;

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
    if (!order) return NextResponse.json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' }, { status: 404 });

    return NextResponse.json({
      ...order,
      nextActions: OrderLifecycleService.getAllowedNextStatuses(order.status),
      isDelayed: ['RELEASED', 'IN_PROGRESS', 'QC_PENDING'].includes(order.status) && new Date(order.dueDate) < new Date(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve order details', code: 'SERVER_ERROR' }, { status: 500 });
  }
}

const TRANSITIONS_REQUIRING_NOTES = new Set(['CANCELLED', 'ON_HOLD', 'REWORK']);
const ALL_STATUSES = new Set(['PLANNED','RELEASED','IN_PROGRESS','QC_PENDING','APPROVED','REWORK','ON_HOLD','COMPLETED','CANCELLED']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY']);
  if (authError) return authError;

  const { id } = await params;
  try {
    const body = await req.json();
    const newStatus = body.status;
    const notes: string | undefined = body.notes;

    if (!newStatus || !ALL_STATUSES.has(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status: "${newStatus}". Must be one of: ${[...ALL_STATUSES].join(', ')}`, code: 'INVALID_STATUS' },
        { status: 400 }
      );
    }

    if (TRANSITIONS_REQUIRING_NOTES.has(newStatus)) {
      if (!notes || typeof notes !== 'string' || notes.trim().length < 5) {
        const label = STATUS_LABELS[newStatus] ?? newStatus;
        return NextResponse.json(
          {
            error: `A reason (minimum 5 characters) is required when setting an order to "${label}". Please provide notes explaining why.`,
            code: 'NOTES_REQUIRED',
            field: 'notes',
          },
          { status: 400 }
        );
      }
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
      notes: notes?.trim(),
    });

    return NextResponse.json({
      ...order,
      statusLabel: STATUS_LABELS[order.status] ?? order.status,
      nextActions: OrderLifecycleService.getAllowedNextStatuses(order.status, role),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Status update failed';
    const httpStatus =
      /Role .* cannot set order/i.test(message) ? 403 :
      /Cannot move from|Order is|no further changes/i.test(message) ? 422 :
      /not yet completed|workflow task/i.test(message) ? 422 :
      /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message, code: httpStatus === 422 ? 'TRANSITION_BLOCKED' : httpStatus === 403 ? 'FORBIDDEN' : 'SERVER_ERROR' }, { status: httpStatus });
  }
}
