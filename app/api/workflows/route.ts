import { BPMNEngine } from '@/lib/engines';
import { NextRequest } from 'next/server';

// Initialize engine (consider using a singleton pattern)
let engine: BPMNEngine | null = null;

function getEngine() {
    if (!engine) {
        engine = new BPMNEngine();
        setupProcesses(engine);
    }
    return engine;
}

function setupProcesses(engine: BPMNEngine) {
    // Register your processes here
    // See COMPLETE_EXAMPLES.ts for full process definitions
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, processId, instanceId, context } = body;

        const bpmnEngine = getEngine();

        if (action === 'start') {
            // Validate required fields
            if (!processId) {
                return Response.json(
                    { error: 'processId is required' },
                    { status: 400 }
                );
            }

            // Start process
            const instance = await bpmnEngine.startProcess(processId, context || {});

            return Response.json({
                success: true,
                instance: {
                    id: instance.id,
                    processId: instance.processId,
                    state: instance.state,
                    variables: instance.variables,
                    createdAt: new Date(),
                },
            });
        }

        if (action === 'getState') {
            if (!instanceId) {
                return Response.json(
                    { error: 'instanceId is required' },
                    { status: 400 }
                );
            }

            const instance = bpmnEngine.getInstance(instanceId);
            if (!instance) {
                return Response.json(
                    { error: 'Instance not found' },
                    { status: 404 }
                );
            }

            return Response.json({
                success: true,
                instance: {
                    id: instance.id,
                    state: instance.state,
                    variables: instance.variables,
                    executionHistory: instance.history,
                },
            });
        }

        if (action === 'getHistory') {
            if (!instanceId) {
                return Response.json(
                    { error: 'instanceId is required' },
                    { status: 400 }
                );
            }

            const instance = bpmnEngine.getInstance(instanceId);
            if (!instance) {
                return Response.json(
                    { error: 'Instance not found' },
                    { status: 404 }
                );
            }

            return Response.json({
                success: true,
                history: instance.history,
            });
        }

        return Response.json(
            { error: 'Unknown action' },
            { status: 400 }
        );
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
        const action = searchParams.get('action');
        const instanceId = searchParams.get('instanceId');

        const engine = getEngine();

        if (action === 'getState' && instanceId) {
            const instance = engine.getInstance(instanceId);
            if (!instance) {
                return Response.json({ error: 'Not found' }, { status: 404 });
            }

            return Response.json({
                success: true,
                instance: {
                    id: instance.id,
                    state: instance.state,
                    variables: instance.variables,
                },
            });
        }

        return Response.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('Workflow GET error:', error);
        return Response.json({ error: 'Server error' }, { status: 500 });
    }
}
