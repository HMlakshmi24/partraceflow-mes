'use server';

import { prisma } from '@/lib/services/database';
import { QueueService } from '@/lib/services/QueueService';
import { WorkflowEngine } from '@/lib/engines/WorkflowEngine';
import { AuditService, EventType } from '@/lib/services/AuditService';
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

export async function getOperatorTasks() {
    const tasks = await prisma.workflowTask.findMany({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        include: {
            instance: { include: { workOrder: true } },
            stepDef: true,
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

    return sorted.map(t => ({
        id: t.id,
        status: t.status,
        orderNumber: t.instance?.workOrder?.orderNumber,
        stepName: t.stepDef?.name || 'Operation Step',
        startTime: t.startTime ? t.startTime.toISOString() : undefined,
        endTime: t.endTime ? t.endTime.toISOString() : undefined,
    }));
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
        const operatorId = await resolveOperatorId(operator);
        await QueueService.claimTask(taskId, operatorId);
        await AuditService.log(EventType.TASK_ASSIGNED, `Task ${taskId} started by ${operator}`, { taskId }, operatorId);
        revalidatePath('/operator');
        return { success: true };
    } catch (e) {
        console.error('[startTask]', e);
        return { success: false, msg: (e as Error).message };
    }
}

export async function completeTask(taskId: string, operator: string) {
    try {
        const operatorId = await resolveOperatorId(operator);
        await WorkflowEngine.completeUserTask(taskId, {});
        await AuditService.log(EventType.TASK_COMPLETED, `Task ${taskId} completed by ${operator}`, { taskId }, operatorId);
        revalidatePath('/operator');
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
