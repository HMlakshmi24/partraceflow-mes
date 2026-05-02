'use server';

import { prisma } from '@/lib/services/database';
import { QueueService } from '@/lib/services/QueueService';
import { WorkflowEngine } from '@/lib/engines/WorkflowEngine';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { revalidatePath } from 'next/cache';

/**
 * Resolve a username or operator code to a real User.id.
 * Creates a default operator user if one doesn't exist yet.
 */
async function resolveOperatorId(operatorUsername: string): Promise<string> {
    // First try to find existing user by id (in case a real UUID is passed)
    const byId = await prisma.user.findUnique({ where: { id: operatorUsername } }).catch(() => null);
    if (byId) return byId.id;

    // Try to find by username
    const byUsername = await prisma.user.findUnique({ where: { username: operatorUsername } }).catch(() => null);
    if (byUsername) return byUsername.id;

    // Create the operator user on-the-fly for demo/dev environments
    const newUser = await prisma.user.create({
        data: {
            username: operatorUsername,
            role: 'OPERATOR',
        }
    });
    return newUser.id;
}

/**
 * Check if task can be started based on workflow sequence.
 * All previous tasks in the workflow must be COMPLETED before starting a new task.
 * Returns { canStart: true } if allowed, or { canStart: false, reason: string } if blocked.
 */
export async function checkWorkflowSequence(taskId: string): Promise<{ canStart: boolean; reason?: string; blockingTasks?: string[] }> {
    // Get the task with its instance and step definition
    const task = await prisma.workflowTask.findUnique({
        where: { id: taskId },
        include: {
            stepDef: true,
            instance: {
                include: {
                    tasks: {
                        include: { stepDef: true },
                        orderBy: { stepDef: { sequence: 'asc' } }
                    }
                }
            }
        }
    });

    if (!task) {
        return { canStart: false, reason: 'Task not found' };
    }

    if (task.status === 'COMPLETED') {
        return { canStart: false, reason: 'Task is already completed' };
    }

    if (task.status === 'IN_PROGRESS') {
        return { canStart: false, reason: 'Task is already in progress' };
    }

    // Get all tasks in this workflow instance
    const allTasks = task.instance.tasks;
    const thisSequence = task.stepDef?.sequence ?? 999;

    // Find blocking tasks (tasks with lower sequence that are not completed)
    const blockingTasks = allTasks
        .filter(t => {
            const tSeq = t.stepDef?.sequence ?? 0;
            return tSeq < thisSequence && t.status !== 'COMPLETED';
        })
        .map(t => t.stepDef?.name || t.id);

    if (blockingTasks.length > 0) {
        return { 
            canStart: false, 
            reason: `Cannot start task - previous step(s) not completed: ${blockingTasks.join(', ')}`,
            blockingTasks
        };
    }

    return { canStart: true };
}

export async function getOperatorTasks() {
    const tasks = await prisma.workflowTask.findMany({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        include: {
            instance: {
                include: {
                    workOrder: { include: { product: true } },
                    // Fetch ALL tasks in this instance so we can compute canStart server-side
                    tasks: {
                        include: { stepDef: true },
                        orderBy: { stepDef: { sequence: 'asc' } },
                    },
                },
            },
            stepDef: true,
            machine: true,
            operator: true,
        },
        orderBy: { startTime: 'asc' },
    });

    // Sort: IN_PROGRESS first, then by work order priority + due date
    const sorted = tasks.sort((a, b) => {
        if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
        if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
        const pa = a.instance.workOrder.priority ?? 0;
        const pb = b.instance.workOrder.priority ?? 0;
        if (pa !== pb) return pb - pa;
        return new Date(a.instance.workOrder.dueDate).getTime() - new Date(b.instance.workOrder.dueDate).getTime();
    });

    return sorted.map(t => {
        const allInstanceTasks = t.instance.tasks;
        const totalSteps = allInstanceTasks.length;
        const thisSeq = t.stepDef?.sequence ?? 999;

        // Compute which earlier steps are blocking this task from starting
        const blockingSteps = allInstanceTasks.filter(other => {
            const otherSeq = other.stepDef?.sequence ?? 0;
            return otherSeq < thisSeq && other.status !== 'COMPLETED';
        });
        const canStart = t.status === 'PENDING' && blockingSteps.length === 0;
        const blockingReason = blockingSteps.length > 0
            ? `Waiting for: ${blockingSteps.map(b => b.stepDef?.name ?? 'previous step').join(', ')}`
            : null;

        return {
            id: t.id,
            status: t.status,
            orderId: t.instance?.workOrder?.id ?? null,
            orderNumber: t.instance?.workOrder?.orderNumber,
            orderStatus: t.instance?.workOrder?.status,
            productName: t.instance?.workOrder?.product?.name ?? null,
            dueDate: t.instance?.workOrder?.dueDate?.toISOString() ?? null,
            priority: t.instance?.workOrder?.priority ?? 1,
            stepName: t.stepDef?.name || 'Operation Step',
            stepSequence: t.stepDef?.sequence ?? 1,
            totalSteps,
            machineName: t.machine?.name ?? null,
            machineCode: t.machine?.code ?? null,
            machineStatus: t.machine?.status ?? null,
            operatorName: t.operator?.username ?? null,
            startTime: t.startTime?.toISOString() ?? null,
            endTime: t.endTime?.toISOString() ?? null,
            canStart,
            blockingReason,
        };
    });
}

export async function getOperatorUsers() {
    const users = await prisma.user.findMany({
        where: { role: { in: ['OPERATOR', 'SUPERVISOR'] } },
        orderBy: { username: 'asc' },
        select: { id: true, username: true, role: true },
    });
    return users;
}

export async function getMachinesForOperator() {
    const machines = await prisma.machine.findMany({
        where: { status: { not: 'OFFLINE' } },
        select: { id: true, code: true, name: true, status: true },
        orderBy: { code: 'asc' },
    });
    return machines;
}

export async function startTask(taskId: string, operator: string) {
    try {
        // First check workflow sequence - ensure all previous tasks are completed
        const sequenceCheck = await checkWorkflowSequence(taskId);
        if (!sequenceCheck.canStart) {
            // Log the blocked attempt
            const operatorId = await resolveOperatorId(operator);
            await AuditService.log(
                EventType.TASK_BLOCKED,
                `Task ${taskId} blocked for ${operator}: ${sequenceCheck.reason}`,
                { taskId, operator, blockingTasks: sequenceCheck.blockingTasks },
                operatorId
            );
            return { success: false, msg: sequenceCheck.reason };
        }

        const operatorId = await resolveOperatorId(operator);
        await QueueService.claimTask(taskId, operatorId);
        await OrderLifecycleService.onTaskStarted(taskId, { userId: operatorId, username: operator, role: 'OPERATOR' });
        
        // Log task start with detailed audit trail
        await AuditService.log(
            EventType.TASK_ASSIGNED,
            `Task ${taskId} started by ${operator}`,
            { 
                taskId, 
                operator, 
                startedAt: new Date().toISOString(),
                ipAddress: 'server-side'
            },
            operatorId
        );
        
        revalidatePath('/operator');
        revalidatePath('/planner');
        return { success: true };
    } catch (e) {
        console.error('[startTask]', e);
        return { success: false, msg: (e as Error).message };
    }
}

export async function completeTask(taskId: string, operator: string) {
    try {
        const operatorId = await resolveOperatorId(operator);
        
        // Get task details for audit logging before completion
        const task = await prisma.workflowTask.findUnique({
            where: { id: taskId },
            include: { stepDef: true }
        });
        
        if (!task) {
            return { success: false, msg: 'Task not found' };
        }
        
        if (task.status !== 'IN_PROGRESS') {
            return { success: false, msg: `Task is not in progress - current status: ${task.status}` };
        }
        
        // Calculate duration from task start time
        const startTime = task.startTime ? new Date(task.startTime).getTime() : Date.now();
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        await WorkflowEngine.completeUserTask(taskId, {});
        await OrderLifecycleService.onTaskCompleted(taskId, { userId: operatorId, username: operator, role: 'OPERATOR' });

        // Log task completion with detailed audit trail
        await AuditService.log(
            EventType.TASK_COMPLETED,
            `Task ${taskId} completed by ${operator}`,
            { 
                taskId, 
                operator, 
                stepName: task.stepDef?.name,
                completedAt: new Date().toISOString(),
                durationSeconds: duration,
                durationFormatted: duration > 0 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : 'N/A'
            },
            operatorId
        );
        
        revalidatePath('/operator');
        revalidatePath('/planner');
        return { success: true };
    } catch (e) {
        console.error('[completeTask]', e);
        return { success: false, msg: (e as Error).message };
    }
}

export async function getSystemEvents() {
    return await prisma.systemEvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: 50
    });
}

export async function getOrderActivities(orderId: string) {
    if (!orderId) return [];
    return await prisma.orderActivity.findMany({
        where: { orderId },
        orderBy: { timestamp: 'desc' },
        take: 40,
        select: {
            id: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            performedBy: true,
            role: true,
            machine: true,
            operator: true,
            notes: true,
            timestamp: true,
        },
    });
}
