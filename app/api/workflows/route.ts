import { NextRequest } from 'next/server';
import { WorkflowEngine } from '@/lib/engines/WorkflowEngine';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('workflows');
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { ErrorTrackingService } from '@/lib/services/ErrorTrackingService';

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
      const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR']);
      if (authError) return authError;
    } else if (action === 'complete_task') {
      const authError = await requireRole(req, OPERATOR_WORKFLOW_ROLES);
      if (authError) return authError;
    } else if (['get_instance', 'list_instances', 'get_pending_tasks'].includes(action)) {
      // MEDIUM fix: these three read actions previously had no role check at
      // all (only the if/else-if chain above gated 'start'/'complete_task'),
      // so any authenticated role — not just the roles GET /api/workflows
      // requires for the equivalent reads — could list every workflow
      // instance/task in the plant. Matched to GET's role set for consistency.
      const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR', 'QC', 'QUALITY']);
      if (authError) return authError;
    }

    if (action === 'start') {
      const { processId } = body;
      const { workOrderId } = body;

      try {
        if (!workOrderId) {
          return Response.json(
            { success: true, message: 'No work orders configured' },
            { status: 200 },
          );
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
        await ErrorTrackingService.captureException('workflows.api.start', e, 'HIGH');
        // HIGH-11 fix: only echo the message back for WorkflowEngine's own
        // deliberate, safe-to-display errors — anything else (e.g. a raw
        // Prisma failure) gets a generic message instead.
        const message = e instanceof Error ? e.message : '';
        const isKnownBusinessError = /Definition not found|No Start Event found/i.test(message);
        return Response.json({ success: false, error: isKnownBusinessError ? message : 'Failed to start workflow instance' });
      }
    }

    if (action === 'complete_task') {
      const { taskId } = body;
      if (!taskId) return Response.json({ error: 'taskId is required', code: 'MISSING_FIELD' }, { status: 400 });

      const session = getRequestSession(req);

      try {
        const taskBefore = await prisma.workflowTask.findUnique({
          where: { id: taskId },
          select: { status: true, operatorId: true, stepDef: { select: { name: true } } },
        });

        if (!taskBefore) {
          return Response.json({ error: 'Task not found', code: 'TASK_NOT_FOUND' }, { status: 404 });
        }

        // Enforce: task must be IN_PROGRESS — operator must start before completing
        if (taskBefore.status !== 'IN_PROGRESS') {
          return Response.json({
            error: `Task cannot be completed — current status is "${taskBefore.status}". The operator must start the task first.`,
            code: 'TASK_NOT_IN_PROGRESS',
          }, { status: 422 });
        }

        const actor = {
          userId: session?.userId,
          username: session?.username ?? 'system',
          role: session?.role ?? 'OPERATOR',
        };

        await WorkflowEngine.completeUserTask(taskId, {}, actor);

        await AuditService.log(
          EventType.TASK_COMPLETED,
          `Task ${taskId} completed by ${actor.username}`,
          { taskId, performedBy: actor.username, role: actor.role },
          actor.userId,
        );
        await AuditService.logDiffs({
          entityType: 'WorkflowTask',
          entityId: taskId,
          before: { status: taskBefore.status },
          after: { status: 'COMPLETED' },
          changedBy: actor.username,
          changedByRole: actor.role,
          changedByUserId: actor.userId,
          eventType: 'TASK_COMPLETED',
          summary: `Task completed by ${actor.username}`,
        });

        // Trigger order lifecycle — auto-transition to QC_PENDING when all tasks done
        await OrderLifecycleService.onTaskCompleted(taskId, actor).catch(err => {
          log.warn('onTaskCompleted failed (non-fatal)', { taskId, message: err instanceof Error ? err.message : String(err) });
        });

        return Response.json({ success: true });
      } catch (e) {
        await ErrorTrackingService.captureException('workflows.api.complete_task', e, 'HIGH');
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
        // HIGH-11 fix: only the three recognized business-logic cases above
        // are safe, deliberately-authored messages — the SERVER_ERROR
        // fallback can be a raw/unexpected error, so don't echo it.
        return Response.json({ error: code === 'SERVER_ERROR' ? 'Failed to complete task' : message, code }, { status: httpStatus });
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
    log.error('POST /api/workflows error', { message: error instanceof Error ? error.message : String(error) });
    await ErrorTrackingService.captureException('workflows.api.post', error, 'CRITICAL');
    // HIGH-11 fix: this is the outermost catch-all — most likely to be
    // catching a raw/unexpected error, so don't echo it to the client.
    return Response.json({ error: 'Request failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR', 'QC', 'QUALITY']);
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
      prisma.workflowDefinition.findMany({ orderBy: { name: 'asc' }, take: 200 }),
    ]);

    return Response.json({ instances, definitions });
  } catch (error) {
    log.error('GET /api/workflows error', { message: error instanceof Error ? error.message : String(error) });
    await ErrorTrackingService.captureException('workflows.api.get', error, 'HIGH');
    return Response.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}
