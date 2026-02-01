import { EventIntegrationEngine } from '@/lib/engines';
import { NextRequest } from 'next/server';

let engine: EventIntegrationEngine | null = null;

function getEngine() {
    if (!engine) {
        engine = new EventIntegrationEngine();
    }
    return engine;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, source, sourceId, timestamp, payload } = body;

        const eventEngine = getEngine();

        if (action === 'sendEvent') {
            if (!source) {
                return Response.json(
                    { error: 'source is required' },
                    { status: 400 }
                );
            }

            const normalized = await eventEngine.handleRawEvent({
                source,
                sourceId: sourceId || 'unknown',
                timestamp: timestamp ? new Date(timestamp) : new Date(),
                payload: payload || {},
            });

            return Response.json({
                success: true,
                event: {
                    id: normalized.id,
                    type: normalized.type,
                    data: normalized.data,
                    timestamp: normalized.timestamp,
                },
            });
        }

        return Response.json(
            { error: 'Unknown action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Event API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
