'use server';

import { prisma } from '@/lib/services/database';
import { revalidatePath } from 'next/cache';

export async function getOperatorTasks() {
    // Return all tasks that are ready for action
    const tasks = await prisma.workflowTask.findMany({
        where: {
            // Optional: filter by machine/operator if needed
        },
        include: {
            instance: {
                include: {
                    workOrder: true // Join to get orderNumber
                }
            }
        },
        orderBy: {
            instance: { workOrder: { createdAt: 'asc' } } // Oldest first
        }
    });

    return tasks.map(t => ({
        ...t,
        orderNumber: t.instance?.workOrder?.orderNumber,
        // Ensure dates are strings for serialization to Client Components if needed, 
        // though Next.js Server Actions usually handle Dates fine now, safest to convert if UI expects strings
        startTime: t.startTime ? t.startTime.toISOString() : undefined,
        endTime: t.endTime ? t.endTime.toISOString() : undefined,
    }));
}

export async function startTask(taskId: string, operator: string) {
    const task = await prisma.workflowTask.findUnique({
        where: { id: taskId },
        include: { stepDef: true }
    });
    if (!task) throw new Error('Task not found');

    if (task.status !== 'PENDING') return { success: false, msg: 'Task already started' };

    await prisma.$transaction([
        prisma.workflowTask.update({
            where: { id: taskId },
            data: {
                status: 'IN_PROGRESS',
                operatorId: operator, // We might need to map this to a UUID if Operator is a User relation
                startTime: new Date()
            }
        }),
        prisma.systemEvent.create({
            data: {
                eventType: 'TASK_START',
                details: `Task ${task.stepDef?.name || 'Unknown'} started by ${operator}`,
            }
        })
    ]);

    revalidatePath('/operator');
    return { success: true };
}

export async function completeTask(taskId: string, operator: string) {
    const task = await prisma.workflowTask.findUnique({
        where: { id: taskId },
        include: { stepDef: true }
    });
    if (!task) throw new Error('Task not found');

    if (task.status !== 'IN_PROGRESS') return { success: false, msg: 'Must accept task first' };

    await prisma.$transaction([
        prisma.workflowTask.update({
            where: { id: taskId },
            data: {
                status: 'COMPLETED',
                endTime: new Date()
            }
        }),
        prisma.systemEvent.create({
            data: {
                eventType: 'TASK_COMPLETE',
                details: `Task ${task.stepDef?.name || 'Unknown'} completed by ${operator}`
            }
        })
    ]);

    revalidatePath('/operator');
    return { success: true };
}

export async function getSystemEvents() {
    return await prisma.systemEvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: 50
    });
}
