import { QueueManager, DispatchStrategy } from '@/lib/engines';
import { MOCK_OPERATORS } from '@/lib/engines';
import { NextRequest } from 'next/server';

let queueManager: QueueManager | null = null;

function getQueueManager() {
    if (!queueManager) {
        queueManager = new QueueManager(DispatchStrategy.SKILL_BASED);
        initializeWorkers(queueManager);
    }
    return queueManager;
}

function initializeWorkers(manager: QueueManager) {
    for (const operator of MOCK_OPERATORS) {
        manager.registerWorker(
            operator.id,
            operator.name,
            operator.skills,
            2 // max concurrent
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, taskId, processId, priority, requiredSkills, estimatedDuration, itemId, result } = body;

        const queue = getQueueManager();

        if (action === 'enqueue') {
            if (!taskId || !processId) {
                return Response.json(
                    { error: 'taskId and processId are required' },
                    { status: 400 }
                );
            }

            const item = queue.enqueue(taskId, processId, {
                priority: priority || 5,
                requiredSkills: requiredSkills || [],
                estimatedDuration: estimatedDuration || 3600000,
            });

            return Response.json({
                success: true,
                item: {
                    id: item.id,
                    taskId: item.taskId,
                    state: item.state,
                    priority: item.priority,
                    createdAt: item.createdAt,
                },
            });
        }

        if (action === 'complete') {
            if (!itemId) {
                return Response.json(
                    { error: 'itemId is required' },
                    { status: 400 }
                );
            }

            await queue.completeItem(itemId, result || {});

            return Response.json({
                success: true,
                message: 'Item completed',
            });
        }

        if (action === 'getMetrics') {
            const metrics = queue.getMetrics();

            return Response.json({
                success: true,
                metrics: {
                    totalItems: metrics.totalItems,
                    itemsByState: metrics.itemsByState,
                    averageWaitTime: metrics.averageWaitTime,
                    averageProcessTime: metrics.averageProcessTime,
                    // workers: metrics.workers, // Not available in metrics
                    utilization: metrics.utilization,
                },
            });
        }

        return Response.json(
            { error: 'Unknown action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Queue API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action');

        const queue = getQueueManager();

        if (action === 'metrics') {
            const metrics = queue.getMetrics();
            return Response.json({ success: true, metrics });
        }

        return Response.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('Queue GET error:', error);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
