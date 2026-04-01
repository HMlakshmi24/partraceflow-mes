import { prisma } from '@/lib/services/database';

export class QueueService {

    /**
     * Get prioritized list of tasks for an operator or machine.
     * Rules:
     * 1. Priority (High Number = Higher Priority)
     * 2. Due Date (Earlier = Higher Priority)
     * 3. FIFO (Created Earlier = Higher Priority)
     */
    static async getPendingTasks(resourceId: string) {
        // Step 1: Fetch all PENDING tasks
        // In a real system, we would filter by skill/machine matching here.
        const tasks = await prisma.workflowTask.findMany({
            where: {
                status: 'PENDING',
                // Optional: machineId == resourceId (if it's a machine)
            },
            include: {
                instance: {
                    include: {
                        workOrder: true
                    }
                },
                stepDef: true
            }
        });

        // Step 2: Sort based on brochure's "Intelligent Queue" logic
        return tasks.sort((a, b) => {
            const priorityA = a.instance.workOrder.priority ?? 0;
            const priorityB = b.instance.workOrder.priority ?? 0;

            // 1. Priority (Desc)
            if (priorityA !== priorityB) return priorityB - priorityA;

            // 2. Due Date (Asc)
            const dueA = new Date(a.instance.workOrder.dueDate).getTime();
            const dueB = new Date(b.instance.workOrder.dueDate).getTime();
            if (dueA !== dueB) return dueA - dueB;

            // 3. FIFO (Asc)
            return new Date(a.id).getTime() - new Date(b.id).getTime(); // Using UUID timestamp approximation or created_at if available
        });
    }

    /**
     * Assign a task to a user (Claim).
     */
    static async claimTask(taskId: string, userId: string) {
        const task = await prisma.workflowTask.findUnique({ where: { id: taskId } });
        if (!task) throw new Error('Task not found');
        if (task.status !== 'PENDING') throw new Error('Task is not pending');
        if (task.operatorId && task.operatorId !== userId) throw new Error('Task already claimed by another user');

        return await prisma.workflowTask.update({
            where: { id: taskId },
            data: {
                operatorId: userId,
                status: 'IN_PROGRESS',
                startTime: new Date()
            }
        });
    }
}
