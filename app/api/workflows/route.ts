import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'start') {
            return Response.json({
                success: true,
                instance: {
                    id: 'wf-' + Date.now(),
                    processId: body.processId || 'default',
                    state: 'active',
                    variables: body.context || {},
                    createdAt: new Date(),
                },
            });
        }

        if (action === 'getState') {
            return Response.json({
                success: true,
                instance: {
                    id: body.instanceId,
                    state: 'running',
                    variables: {},
                },
            });
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
    return Response.json({ message: 'Workflow API - Use POST for actions' }, { status: 200 });
}
