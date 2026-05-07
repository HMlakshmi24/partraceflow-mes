import { NextRequest } from 'next/server';
import { WorkflowEngine } from '@/lib/engines/WorkflowEngine';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { prisma } from '@/lib/services/database';
import { requireRole, getRequestSession } from '@/lib/api-auth';

/**
 * Workflow runtime API.
 *
 * Enforces step-sequence order via WorkflowEngine (tasks must complete in
 * defined sequence order). Role restrictions ensure only authorised roles
 * can start instances or complete tasks.
 */
const PLANNER_ACTIONS = ['start'];
const OPERATOR_WORKFLOW_ROLES = ['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (!action || typeof action !== 'string') {
      return Response.json({ error: 'action field is required', code: 'MISSING_ACTION' }, { status: 400 });
    }

    // Starting a new workflow instance is planner-level; task operations allow operators
    if (PLANNER_ACTIONS.includes(action)) {
      const authError = requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR']);
      if (authError) return authError;
    } else if (action === 'complete_task') {
      const authError = requireRole(req, OPERATOR_WORKFLOW_ROLES);
      if (authError) return authError;
    }

    if (action === 'start') {
      const { processId } = body;
      let { workOrderId } = body;

      try {
        if (!workOrderId) {
          let product = await prisma.product.findFirst();
          if (!product) {
            product = await prisma.product.create({
              data: { sku: 'PART-DEMO', name: 'Demo Part', description: 'Auto-created demo product' },
            });
          }
          const demoOrder = await prisma.workOrder.create({
            data: {
              orderNumber: `WO-DEMO-${Date.now()}`,
              quantity: 10,
              priority: 1,
              status: 'RELEASED',
              dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
              productId: product.id,
            },
          });
          workOrderId = demoOrder.id;
        }

        const instance = await WorkflowEngine.startInstance(processId, workOrderId);
        await AuditService.log(EventType.WORKFLOW_START, 'Workflow started', { instanceId: instance.id });

        return Response.json({
          success: true,
          instance: {
            id: instance.id,
            status: instance.status,
            createdAt: new Date(),
          },
        });
      } catch (e) {
        return Response.json({ success: false, error: (e as Error).message });
      }
    }

    if (action === 'complete_task') {
      const { taskId } = body;
      if (!taskId) return Response.json({ error: 'taskId is required', code: 'MISSING_FIELD' }, { status: 400 });

      const session = getRequestSession(req);

      try {
        await WorkflowEngine.completeUserTask(taskId, {});
        await AuditService.log(
          EventType.TASK_COMPLETED,
          `Task ${taskId} completed by ${session?.username ?? 'unknown'}`,
          { taskId, performedBy: session?.username, role: session?.role },
          session?.userId,
        );
        return Response.json({ success: true });
      } catch (e) {
        const message = (e as Error).message;
        const isPreviousTaskBlocking = /Previous task/i.test(message);
        const isAlreadyDone = /already completed/i.test(message);
        const isNotFound = /not found/i.test(message);
        const httpStatus = isPreviousTaskBlocking || isAlreadyDone ? 422 : isNotFound ? 404 : 500;
        const code = isPreviousTaskBlocking ? 'PREVIOUS_STEP_INCOMPLETE' : isAlreadyDone ? 'ALREADY_COMPLETED' : isNotFound ? 'TASK_NOT_FOUND' : 'SERVER_ERROR';
        if (isPreviousTaskBlocking) {
          await AuditService.log(
            EventType.TASK_BLOCKED,
            `Task ${taskId} blocked — previous step incomplete. Attempted by ${session?.username ?? 'unknown'}`,
            { taskId, performedBy: session?.username, role: session?.role, reason: message },
            session?.userId,
          );
        }
        return Response.json({ error: message, code }, { status: httpStatus });
      }
    }

    if (action === 'get_instance') {
      const { instanceId } = body;
      if (!instanceId) return Response.json({ error: 'instanceId required' }, { status: 400 });

      const instance = await prisma.workflowInstance.findUnique({
        where: { id: instanceId },
        include: {
          tasks: true,
          tokens: { orderBy: { createdAt: 'asc' } },
          workOrder: { include: { product: true } },
        },
      });
      if (!instance) return Response.json({ error: 'Instance not found' }, { status: 404 });
      return Response.json({ instance });
    }

    if (action === 'list_instances') {
      const { status, limit } = body;
      const where: Record<string, string> = {};
      if (status) where.status = status;

      const instances = await prisma.workflowInstance.findMany({
        where,
        include: {
          tasks: { select: { status: true } },
          workOrder: { include: { product: { select: { name: true, sku: true } } } },
        },
        orderBy: { id: 'desc' },
        take: limit ?? 50,
      });
      return Response.json({ instances });
    }

    if (action === 'get_pending_tasks') {
      const { assigneeId } = body;
      const where: { status: { in: string[] }; operatorId?: string } = { status: { in: ['PENDING', 'IN_PROGRESS'] } };
      if (assigneeId) where.operatorId = assigneeId;

      const tasks = await prisma.workflowTask.findMany({
        where,
        include: {
          instance: {
            include: { workOrder: { include: { product: { select: { name: true } } } } },
          },
        },
        orderBy: { id: 'asc' },
        take: 100,
      });
      return Response.json({ tasks });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Workflow API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const authError = requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR', 'QC', 'QUALITY']);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get('instanceId');
    const status = searchParams.get('status');

    if (instanceId) {
      const instance = await prisma.workflowInstance.findUnique({
        where: { id: instanceId },
        include: {
          tasks: true,
          tokens: { orderBy: { createdAt: 'asc' } },
          workOrder: { include: { product: true } },
        },
      });
      return Response.json({ instance });
    }

    const where: Record<string, string> = {};
    if (status) where.status = status;

    const [instances, definitions] = await Promise.all([
      prisma.workflowInstance.findMany({
        where,
        include: {
          tasks: { select: { status: true } },
          workOrder: { include: { product: { select: { name: true, sku: true } } } },
        },
        orderBy: { id: 'desc' },
        take: 50,
      }),
      prisma.workflowDefinition.findMany({ orderBy: { name: 'asc' } }),
    ]);

    return Response.json({ instances, definitions });
  } catch (error) {
    console.error('Workflow GET error:', error);
    return Response.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}
