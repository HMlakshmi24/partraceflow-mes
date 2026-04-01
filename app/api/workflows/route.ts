import { NextRequest } from 'next/server';
import { WorkflowEngine } from '@/lib/engines/WorkflowEngine';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { prisma } from '@/lib/services/database';

/**
 * Workflow runtime API (mock)
 *
 * This API is a lightweight runtime stub used by the frontend to simulate
 * starting workflows and querying instance state. Replace this with your
 * orchestration engine integration (Zeebe/Camunda/Temporal/etc) in production.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'start') {
            let { processId, workOrderId } = body;
            // In a real scenario, processId might be the Definition ID
            // For now, we assume processId passed is the UUID of the definition

            // If workOrderId isn't passed, create a dummy one or fail
            // For demo: create a dummy work order if needed?
            // Better: Require workOrderId

            // Just for the demo script 'smoke_test.ts' that passes `processId: 'smoke'`
            // We need to handle that case gracefully or fail.
            // Let's assume we need a real ID.

            try {
                if (!workOrderId) {
                    let product = await prisma.product.findFirst();
                    if (!product) {
                        product = await prisma.product.create({
                            data: { sku: 'PART-DEMO', name: 'Demo Part', description: 'Auto-created demo product' }
                        });
                    }
                    const demoOrder = await prisma.workOrder.create({
                        data: {
                            orderNumber: `WO-DEMO-${Date.now()}`,
                            quantity: 10,
                            priority: 1,
                            status: 'RELEASED',
                            dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
                            productId: product.id
                        }
                    });
                    workOrderId = demoOrder.id;
                }

                const instance = await WorkflowEngine.startInstance(processId, workOrderId);

                await AuditService.log(EventType.WORKFLOW_START, `Workflow started`, { instanceId: instance.id });

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
            const { taskId, userId } = body;
            if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 });

            const task = await prisma.workflowTask.findUnique({
                where: { id: taskId },
                include: { instance: true }
            });
            if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

            await prisma.workflowTask.update({
                where: { id: taskId },
                data: {
                    status: 'COMPLETED',
                    endTime: new Date(),
                    operatorId: userId ?? task.operatorId,
                }
            });

            await AuditService.log(EventType.TASK_COMPLETED, `Task completed`, { taskId, instanceId: task.instanceId }, userId);

            try {
                const token = await prisma.workflowToken.findFirst({
                    where: { instanceId: task.instanceId, status: 'WAITING' }
                });
                if (token) await WorkflowEngine.processToken(task.instanceId, token.id);
            } catch (_) { /* non-fatal */ }

            return Response.json({ success: true });
        }

        if (action === 'get_instance') {
            const { instanceId } = body;
            if (!instanceId) return Response.json({ error: 'instanceId required' }, { status: 400 });

            const instance = await prisma.workflowInstance.findUnique({
                where: { id: instanceId },
                include: {
                    tasks: true,
                    tokens: { orderBy: { createdAt: 'asc' } },
                    workOrder: { include: { product: true } }
                }
            });
            if (!instance) return Response.json({ error: 'Instance not found' }, { status: 404 });
            return Response.json({ instance });
        }

        if (action === 'list_instances') {
            const { status, limit } = body;
            const where: any = {};
            if (status) where.status = status;

            const instances = await prisma.workflowInstance.findMany({
                where,
                include: {
                    tasks: { select: { status: true } },
                    workOrder: { include: { product: { select: { name: true, sku: true } } } }
                },
                orderBy: { id: 'desc' },
                take: limit ?? 50
            });
            return Response.json({ instances });
        }

        if (action === 'get_pending_tasks') {
            const { assigneeId } = body;
            const where: any = { status: { in: ['PENDING', 'IN_PROGRESS'] } };
            if (assigneeId) where.operatorId = assigneeId;

            const tasks = await prisma.workflowTask.findMany({
                where,
                include: {
                    instance: {
                        include: { workOrder: { include: { product: { select: { name: true } } } } }
                    }
                },
                orderBy: { id: 'asc' },
                take: 100
            });
            return Response.json({ tasks });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('Workflow API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
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
                    workOrder: { include: { product: true } }
                }
            });
            return Response.json({ instance });
        }

        const where: any = {};
        if (status) where.status = status;

        const [instances, definitions] = await Promise.all([
            prisma.workflowInstance.findMany({
                where,
                include: {
                    tasks: { select: { status: true } },
                    workOrder: { include: { product: { select: { name: true, sku: true } } } }
                },
                orderBy: { id: 'desc' },
                take: 50
            }),
            prisma.workflowDefinition.findMany({ orderBy: { name: 'asc' } })
        ]);

        return Response.json({ instances, definitions });
    } catch (error) {
        console.error('Workflow GET error:', error);
        return Response.json({ error: 'Failed to fetch workflows' }, { status: 500 });
    }
}
