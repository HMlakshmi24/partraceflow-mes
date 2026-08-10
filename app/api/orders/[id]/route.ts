import { NextRequest, NextResponse } from 'next/server';
import { STATUS_LABELS } from '@/lib/orderStateMachine';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { AuditService, EventType } from '@/lib/services/AuditService';

async function deny(user: { id: string; role: string }, orderId: string, eventType: EventType) {
  await AuditService.log(eventType, `Access denied to order ${orderId}`, { role: user.role, orderId }, user.id).catch(() => { });
  return NextResponse.json({ error: 'Forbidden: You do not have access to this order', code: eventType }, { status: 403 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY']);
  if (authError) return authError;

  const { id } = await params;
  const role = req.headers.get('x-mes-role') ?? 'SYSTEM';
  const userId = req.headers.get('x-mes-user-id') ?? 'system';
  const user = { id: userId, role };
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

    // ── Role-Based IDOR Authorization ─────────────────────────────────────────
    if (role === 'OPERATOR') {
      // Operators can only view orders they are assigned to
      const assigned = order.workflowInstances.some((inst: any) =>
        inst.tasks.some((t: any) => t.operatorId === userId)
      );
      if (!assigned) return deny(user, id, EventType.ORDER_ACCESS_DENIED);

    } else if (role === 'QC' || role === 'QUALITY') {
      // QC / Quality inspectors cannot access DRAFT orders
      if (order.status === 'DRAFT') return deny(user, id, EventType.ORDER_ACCESS_DENIED);

    } else if (role === 'PLANNER') {
      // Planners can access all orders — log access for traceability
      await AuditService.log(EventType.ORDER_ADMIN_ACCESS, `Planner ${userId} accessed order ${id}`, { orderId: id, role }, userId).catch(() => { });

    } else if (role === 'ADMIN') {
      // Admins have full access — always audit
      await AuditService.log(EventType.ORDER_ADMIN_ACCESS, `Admin accessed order ${id}`, { orderId: id }, userId).catch(() => { });
    }
    // SUPERVISOR has unrestricted access — no extra checks needed

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
const ALL_STATUSES = new Set(['PLANNED', 'RELEASED', 'IN_PROGRESS', 'QC_PENDING', 'APPROVED', 'REWORK', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY']);
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
    const isPrismaOCC = e && typeof e === 'object' && 'code' in e && (e as any).code === 'P2025';
    const message = isPrismaOCC ? 'Concurrent modification detected. Order was modified by another user. Refresh and try again.' : (e instanceof Error ? e.message : 'Status update failed');
    const httpStatus =
      isPrismaOCC ? 409 :
      /Role .* cannot set order/i.test(message) ? 403 :
        /Cannot move from|Order is|no further changes/i.test(message) ? 422 :
          /not yet completed|workflow task/i.test(message) ? 422 :
            /not found/i.test(message) ? 404 : 500;
    
    const errorCode = httpStatus === 409 ? 'CONCURRENCY_CONFLICT' : httpStatus === 422 ? 'TRANSITION_BLOCKED' : httpStatus === 403 ? 'FORBIDDEN' : 'SERVER_ERROR';
    return NextResponse.json({ error: message, code: errorCode }, { status: httpStatus });
  }
}
