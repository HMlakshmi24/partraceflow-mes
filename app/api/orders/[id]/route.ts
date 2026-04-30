import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { canTransition, getTransitionError, STATUS_LABELS } from '@/lib/orderStateMachine';

// Which roles can trigger which target statuses
// Operators execute; Supervisors approve/reject; Planners release; Admins do everything
const ROLE_ACTION_MAP: Record<string, string[]> = {
    RELEASED:    ['ADMIN', 'PLANNER', 'SUPERVISOR'],
    IN_PROGRESS: ['ADMIN', 'OPERATOR', 'SUPERVISOR'],
    QC_PENDING:  ['ADMIN', 'OPERATOR', 'SUPERVISOR'],
    APPROVED:    ['ADMIN', 'SUPERVISOR'],          // operators CANNOT approve
    REWORK:      ['ADMIN', 'SUPERVISOR'],          // only supervisor can send to rework
    COMPLETED:   ['ADMIN', 'SUPERVISOR'],
    ON_HOLD:     ['ADMIN', 'SUPERVISOR'],
    CANCELLED:   ['ADMIN', 'SUPERVISOR', 'PLANNER'],
};

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

        // Action-level RBAC — enforce who can trigger what
        const allowedRoles = ROLE_ACTION_MAP[newStatus] ?? ['ADMIN'];
        if (!allowedRoles.includes(role)) {
            return NextResponse.json(
                { error: `Your role (${role}) cannot set status to "${STATUS_LABELS[newStatus] ?? newStatus}". Required: ${allowedRoles.join(', ')}.` },
                { status: 403 }
            );
        }

        // Update order + log activity in one transaction
        const [order] = await prisma.$transaction([
            prisma.workOrder.update({ where: { id }, data: { status: newStatus } }),
            prisma.orderActivity.create({
                data: {
                    orderId:     id,
                    action:      newStatus === 'REWORK' ? 'QC_RESULT' : 'STATUS_CHANGE',
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

        // ── System-driven events (fire-and-forget, don't block response) ──────
        void triggerSystemEvents(id, current.orderNumber, newStatus, performedBy);

        return NextResponse.json(order);
    } catch (e: any) {
        return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
    }
}

// ── System-driven event triggers ─────────────────────────────────────────────
// Fires after a status change: creates Andon alerts, system notifications,
// and auto-detects overdue orders. Does NOT block the API response.

async function triggerSystemEvents(
    _orderId: string,
    orderNumber: string,
    newStatus: string,
    triggeredBy: string
) {
    try {
        const board = await prisma.andonBoard.findFirst();

        // 1. QC FAILED → Rework: raise RED Andon + system alert
        if (newStatus === 'REWORK') {
            if (board) {
                await prisma.andonEvent.create({
                    data: {
                        boardId:    board.id,
                        color:      'RED',
                        severity:   'CRITICAL',
                        reason:     'QC_FAILURE',
                        message:    `❌ QC FAILED — Order ${orderNumber} sent to Rework`,
                        triggeredBy,
                    },
                });
            }
            await prisma.systemEvent.create({
                data: {
                    eventType: 'QC_FAILURE_ALERT',
                    details:   `ALERT: Order ${orderNumber} QC failed — rework required. Supervisor action needed.`,
                }
            });
        }

        // 2. ON_HOLD: raise YELLOW Andon warning
        if (newStatus === 'ON_HOLD') {
            if (board) {
                await prisma.andonEvent.create({
                    data: {
                        boardId:    board.id,
                        color:      'YELLOW',
                        severity:   'WARNING',
                        reason:     'ON_HOLD',
                        message:    `⚠ Order ${orderNumber} placed ON HOLD`,
                        triggeredBy,
                    },
                });
            }
        }

        // 3. COMPLETED: green Andon
        if (newStatus === 'COMPLETED') {
            if (board) {
                await prisma.andonEvent.create({
                    data: {
                        boardId:    board.id,
                        color:      'GREEN',
                        severity:   'INFO',
                        reason:     'JOB_COMPLETE',
                        message:    `✅ Order ${orderNumber} completed successfully`,
                        triggeredBy,
                    },
                });
            }
        }

        // 4. Auto-detect DELAYED: any active orders now past their due date
        const overdueOrders = await prisma.workOrder.findMany({
            where: {
                status:  { in: ['RELEASED', 'IN_PROGRESS', 'QC_PENDING'] },
                dueDate: { lt: new Date() },
            },
            select: { id: true, orderNumber: true, dueDate: true },
        });
        for (const overdue of overdueOrders) {
            const alreadyFlagged = await prisma.systemEvent.findFirst({
                where: { eventType: 'ORDER_OVERDUE', details: { contains: overdue.orderNumber } },
            });
            if (!alreadyFlagged) {
                await prisma.systemEvent.create({
                    data: {
                        eventType: 'ORDER_OVERDUE',
                        details:   `⚠ DELAYED: Order ${overdue.orderNumber} is past due date (${new Date(overdue.dueDate).toLocaleDateString()})`,
                    }
                });
                if (board) {
                    await prisma.andonEvent.create({
                        data: {
                            boardId:     board.id,
                            color:       'YELLOW',
                            severity:    'WARNING',
                            reason:      'JOB_DELAYED',
                            message:     `⚠ Job delayed: Order ${overdue.orderNumber} past due date`,
                            triggeredBy: 'system',
                        },
                    });
                }
            }
        }
    } catch {
        // Never throw — this is fire-and-forget
    }
}
