import { prisma } from '@/lib/services/database';

export class QueueService {

    static async getPendingTasks(resourceId: string) {
        void resourceId;
        const tasks = await prisma.workflowTask.findMany({
            where: { status: 'PENDING' },
            include: {
                instance: { include: { workOrder: true } },
                stepDef: true,
            },
        });

        return tasks.sort((a, b) => {
            const pa = a.instance.workOrder.priority ?? 0;
            const pb = b.instance.workOrder.priority ?? 0;
            if (pa !== pb) return pb - pa;

            const da = new Date(a.instance.workOrder.dueDate).getTime();
            const db = new Date(b.instance.workOrder.dueDate).getTime();
            if (da !== db) return da - db;

            return a.id.localeCompare(b.id);
        });
    }

    /**
     * Atomically claim a task for an operator.
     *
     * Uses a conditional updateMany (WHERE status = 'PENDING') inside a transaction
     * so two concurrent callers cannot both succeed — only one gets count=1, the
     * other gets count=0 and receives a clear error. Eliminates the read-then-write
     * race condition from the previous single-row update approach.
     */
    static async claimTask(taskId: string, userId: string) {
        const task = await prisma.workflowTask.findUnique({
            where: { id: taskId },
            include: { instance: { include: { workOrder: true } } },
        });
        if (!task) throw new Error('Task not found');

        if (!['RELEASED', 'IN_PROGRESS', 'REWORK'].includes(task.instance.workOrder.status)) {
            throw new Error(
                `Order ${task.instance.workOrder.orderNumber} is ${task.instance.workOrder.status}. Cannot start task.`
            );
        }

        if (task.operatorId && task.operatorId !== userId && task.status === 'PENDING') {
            throw new Error('Task is already claimed by another operator');
        }

        // Atomic claim: only succeeds if status is still PENDING at this instant
        return await prisma.$transaction(async (tx) => {
            const updated = await tx.workflowTask.updateMany({
                where: { id: taskId, status: 'PENDING' },
                data: { operatorId: userId, status: 'IN_PROGRESS', startTime: new Date() },
            });

            if (updated.count === 0) {
                throw new Error('Task was already started by another operator — please refresh your queue');
            }

            return tx.workflowTask.findUniqueOrThrow({ where: { id: taskId } });
        });
    }
}
