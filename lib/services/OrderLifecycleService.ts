import { prisma } from '@/lib/services/database';
import { canTransition, getTransitionError, STATUS_LABELS, getNextActions } from '@/lib/orderStateMachine';
import { NotificationService } from '@/lib/services/NotificationService';

export const ORDER_ROLE_ACTION_MAP: Record<string, string[]> = {
  RELEASED: ['ADMIN', 'PLANNER', 'SUPERVISOR'],
  IN_PROGRESS: ['ADMIN', 'OPERATOR', 'SUPERVISOR'],
  QC_PENDING: ['ADMIN', 'OPERATOR', 'SUPERVISOR', 'QC', 'QUALITY'],
  APPROVED: ['ADMIN', 'SUPERVISOR'],
  REWORK: ['ADMIN', 'SUPERVISOR', 'QC', 'QUALITY'],
  COMPLETED: ['ADMIN', 'SUPERVISOR'],
  ON_HOLD: ['ADMIN', 'SUPERVISOR', 'QC', 'QUALITY'],
  CANCELLED: ['ADMIN', 'SUPERVISOR', 'PLANNER'],
};

type TransitionParams = {
  orderId: string;
  newStatus: string;
  performedBy: string;
  role: string;
  userId?: string;
  notes?: string;
  action?: string;
  machine?: string | null;
  operator?: string | null;
  enforceRole?: boolean;
};

type TaskActor = {
  userId?: string;
  username: string;
  role: string;
};

export class OrderLifecycleService {
  static getAllowedNextStatuses(status: string, role?: string | null) {
    const next = getNextActions(status);
    if (!role) return next;
    return next.filter(target => (ORDER_ROLE_ACTION_MAP[target] ?? ['ADMIN']).includes(role));
  }

  static async transitionOrder(params: TransitionParams) {
    const current = await prisma.workOrder.findUnique({ where: { id: params.orderId } });
    if (!current) throw new Error('Order not found');

    if (current.status === params.newStatus) {
      return current;
    }

    if (!canTransition(current.status, params.newStatus)) {
      throw new Error(getTransitionError(current.status, params.newStatus));
    }

    if (params.enforceRole !== false) {
      const allowedRoles = ORDER_ROLE_ACTION_MAP[params.newStatus] ?? ['ADMIN'];
      if (!allowedRoles.includes(params.role)) {
        throw new Error(
          `Role ${params.role} cannot set order to ${STATUS_LABELS[params.newStatus] ?? params.newStatus}. Required: ${allowedRoles.join(', ')}.`,
        );
      }
    }

    const details = {
      orderId: current.id,
      orderNumber: current.orderNumber,
      action: params.action ?? 'STATUS_CHANGE',
      fromStatus: current.status,
      toStatus: params.newStatus,
      performedBy: params.performedBy,
      role: params.role,
      userId: params.userId ?? null,
      notes: params.notes ?? null,
      machine: params.machine ?? null,
      operator: params.operator ?? null,
      changedAt: new Date().toISOString(),
    };

    const [order] = await prisma.$transaction([
      prisma.workOrder.update({
        where: { id: current.id },
        data: { status: params.newStatus },
      }),
      prisma.orderActivity.create({
        data: {
          orderId: current.id,
          action: params.action ?? (params.newStatus === 'REWORK' ? 'QC_RESULT' : 'STATUS_CHANGE'),
          fromStatus: current.status,
          toStatus: params.newStatus,
          performedBy: params.performedBy,
          role: params.role,
          machine: params.machine ?? null,
          operator: params.operator ?? null,
          notes:
            params.notes ??
            `Status changed from ${STATUS_LABELS[current.status] ?? current.status} to ${STATUS_LABELS[params.newStatus] ?? params.newStatus}`,
        },
      }),
      prisma.systemEvent.create({
        data: {
          eventType: 'ORDER_STATUS_CHANGE',
          details: JSON.stringify(details),
          userId: params.userId,
        },
      }),
    ]);

    await this.emitStatusSideEffects(current.orderNumber, params.newStatus, params.performedBy);

    return order;
  }

  static async recordOrderCreated(params: {
    orderId: string;
    orderNumber: string;
    performedBy: string;
    role: string;
    userId?: string;
    notes?: string;
  }) {
    await prisma.$transaction([
      prisma.orderActivity.create({
        data: {
          orderId: params.orderId,
          action: 'CREATED',
          performedBy: params.performedBy,
          role: params.role,
          notes: params.notes ?? `Order ${params.orderNumber} created and released to production`,
        },
      }),
      prisma.systemEvent.create({
        data: {
          eventType: 'ORDER_CREATED',
          details: JSON.stringify({
            orderId: params.orderId,
            orderNumber: params.orderNumber,
            performedBy: params.performedBy,
            role: params.role,
            userId: params.userId ?? null,
            createdAt: new Date().toISOString(),
          }),
          userId: params.userId,
        },
      }),
    ]);
  }

  static async onTaskStarted(taskId: string, actor: TaskActor) {
    const task = await prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        machine: true,
        stepDef: true,
        instance: { include: { workOrder: true } },
      },
    });
    if (!task) throw new Error('Task not found');

    const order = task.instance.workOrder;
    if (!['RELEASED', 'IN_PROGRESS', 'REWORK'].includes(order.status)) {
      throw new Error(`Order ${order.orderNumber} is in ${order.status}; task execution cannot start yet.`);
    }

    const note = `Task ${task.stepDef.name} started by ${actor.username}${task.machine ? ` on ${task.machine.code}` : ''}`;
    if (order.status === 'RELEASED' || order.status === 'REWORK') {
      await this.transitionOrder({
        orderId: order.id,
        newStatus: 'IN_PROGRESS',
        performedBy: actor.username,
        role: actor.role,
        userId: actor.userId,
        notes: note,
        machine: task.machine?.code ?? null,
        operator: actor.username,
      });
      return;
    }

    await this.recordOrderNote({
      orderId: order.id,
      action: 'TASK_STARTED',
      performedBy: actor.username,
      role: actor.role,
      userId: actor.userId,
      machine: task.machine?.code ?? null,
      operator: actor.username,
      notes: note,
    });
  }

  static async onTaskCompleted(taskId: string, actor?: Partial<TaskActor>) {
    const task = await prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        machine: true,
        stepDef: true,
        instance: {
          include: {
            workOrder: true,
            tasks: {
              include: { stepDef: true },
            },
          },
        },
      },
    });
    if (!task) throw new Error('Task not found');

    const username = actor?.username ?? task.operatorId ?? 'system';
    const role = actor?.role ?? 'OPERATOR';

    await this.recordOrderNote({
      orderId: task.instance.workOrder.id,
      action: 'TASK_COMPLETED',
      performedBy: username,
      role,
      userId: actor?.userId,
      machine: task.machine?.code ?? null,
      operator: username,
      notes: `Task ${task.stepDef.name} completed by ${username}`,
    });

    const remainingTasks = task.instance.tasks.filter(t => t.id !== taskId && t.status !== 'COMPLETED');
    if (remainingTasks.length === 0 && ['IN_PROGRESS', 'RELEASED', 'REWORK'].includes(task.instance.workOrder.status)) {
      await this.transitionOrder({
        orderId: task.instance.workOrder.id,
        newStatus: 'QC_PENDING',
        performedBy: 'system',
        role: 'SYSTEM',
        userId: actor?.userId,
        notes: 'All workflow tasks completed. System routed order to QC.',
        enforceRole: false,
      });
    }
  }

  static async onQualityInspection(params: {
    workOrderId: string;
    result: string;
    performedBy: string;
    role: string;
    userId?: string;
    notes?: string | null;
    defectType?: string | null;
  }) {
    const order = await prisma.workOrder.findUnique({ where: { id: params.workOrderId } });
    if (!order) throw new Error('Order not found');

    const resultUpper = params.result.toUpperCase();
    if (resultUpper === 'FAIL' || resultUpper === 'REWORK') {
      await this.transitionOrder({
        orderId: order.id,
        newStatus: 'REWORK',
        performedBy: params.performedBy,
        role: 'SYSTEM',
        userId: params.userId,
        notes: params.notes ?? params.defectType ?? 'QC failed - rework required',
        action: 'QC_RESULT',
        enforceRole: false,
      });
      return 'REWORK';
    }

    if (resultUpper === 'PASS' && ['IN_PROGRESS', 'RELEASED', 'REWORK'].includes(order.status)) {
      await this.transitionOrder({
        orderId: order.id,
        newStatus: 'QC_PENDING',
        performedBy: params.performedBy,
        role: 'SYSTEM',
        userId: params.userId,
        notes: params.notes ?? 'QC passed and awaiting supervisor approval',
        action: 'QC_RESULT',
        enforceRole: false,
      });
      return 'QC_PENDING';
    }

    await this.recordOrderNote({
      orderId: order.id,
      action: 'QC_RESULT',
      performedBy: params.performedBy,
      role: params.role,
      userId: params.userId,
      notes: params.notes ?? `QC result recorded: ${resultUpper}`,
    });
    return order.status;
  }

  static async flagOverdueOrders() {
    const overdueOrders = await prisma.workOrder.findMany({
      where: {
        status: { in: ['RELEASED', 'IN_PROGRESS', 'QC_PENDING'] },
        dueDate: { lt: new Date() },
      },
      select: { id: true, orderNumber: true, dueDate: true },
    });

    const board = await prisma.andonBoard.findFirst({ where: { isActive: true } });

    for (const overdue of overdueOrders) {
      const existing = await prisma.systemEvent.findFirst({
        where: {
          eventType: 'ORDER_OVERDUE',
          details: { contains: overdue.orderNumber },
          timestamp: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
      }).catch(() => null);
      if (existing) continue;

      const details = `Order ${overdue.orderNumber} is delayed past ${new Date(overdue.dueDate).toLocaleString()}`;
      await prisma.systemEvent.create({
        data: { eventType: 'ORDER_OVERDUE', details },
      });
      await prisma.orderActivity.create({
        data: {
          orderId: overdue.id,
          action: 'ALERT',
          performedBy: 'system',
          role: 'SYSTEM',
          notes: details,
        },
      });
      if (board) {
        await prisma.andonEvent.create({
          data: {
            boardId: board.id,
            color: 'YELLOW',
            severity: 'WARNING',
            reason: 'JOB_DELAYED',
            message: details,
            triggeredBy: 'system',
          },
        }).catch(() => {});
      }
      await NotificationService.sendByEventType('TASK_OVERDUE', {
        orderNumber: overdue.orderNumber,
        dueDate: new Date(overdue.dueDate).toLocaleString(),
      }).catch(() => {});
    }
  }

  private static async recordOrderNote(params: {
    orderId: string;
    action: string;
    performedBy: string;
    role: string;
    userId?: string;
    machine?: string | null;
    operator?: string | null;
    notes: string;
  }) {
    await prisma.$transaction([
      prisma.orderActivity.create({
        data: {
          orderId: params.orderId,
          action: params.action,
          performedBy: params.performedBy,
          role: params.role,
          machine: params.machine ?? null,
          operator: params.operator ?? null,
          notes: params.notes,
        },
      }),
      prisma.systemEvent.create({
        data: {
          eventType: params.action,
          details: JSON.stringify({
            orderId: params.orderId,
            action: params.action,
            performedBy: params.performedBy,
            role: params.role,
            userId: params.userId ?? null,
            machine: params.machine ?? null,
            operator: params.operator ?? null,
            notes: params.notes,
            timestamp: new Date().toISOString(),
          }),
          userId: params.userId,
        },
      }),
    ]);
  }

  private static async emitStatusSideEffects(orderNumber: string, newStatus: string, triggeredBy: string) {
    const board = await prisma.andonBoard.findFirst({ where: { isActive: true } });

    if (newStatus === 'REWORK') {
      if (board) {
        await prisma.andonEvent.create({
          data: {
            boardId: board.id,
            color: 'RED',
            severity: 'CRITICAL',
            reason: 'QC_FAILURE',
            message: `QC failed - ${orderNumber} requires rework`,
            triggeredBy,
          },
        }).catch(() => {});
      }
      await NotificationService.sendByEventType('QUALITY_FAIL', { orderNumber }).catch(() => {});
    }

    if (newStatus === 'ON_HOLD' && board) {
      await prisma.andonEvent.create({
        data: {
          boardId: board.id,
          color: 'YELLOW',
          severity: 'WARNING',
          reason: 'ON_HOLD',
          message: `Order ${orderNumber} placed on hold`,
          triggeredBy,
        },
      }).catch(() => {});
    }

    if (newStatus === 'QC_PENDING') {
      await NotificationService.sendByEventType('QUALITY_PENDING', { orderNumber }).catch(() => {});
    }

    if (newStatus === 'COMPLETED') {
      if (board) {
        await prisma.andonEvent.create({
          data: {
            boardId: board.id,
            color: 'GREEN',
            severity: 'INFO',
            reason: 'JOB_COMPLETE',
            message: `Order ${orderNumber} completed`,
            triggeredBy,
          },
        }).catch(() => {});
      }
      await NotificationService.sendByEventType('ORDER_COMPLETE', { orderNumber }).catch(() => {});
    }
  }
}
