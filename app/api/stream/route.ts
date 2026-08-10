import { NextRequest } from 'next/server';
import { eventBus, MESEvent } from '@/lib/events/EventBus';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth';
import { buildEventDedupKey } from '@/lib/sseUtils';
import { requireRole } from '@/lib/api-auth';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

// Force Node.js runtime — verifySessionToken uses Node crypto (not Web Crypto API)
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, ALL_ROLES);
    if (authError) return authError;

    // Require a valid session — factory event stream must not be publicly accessible
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized — session required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const session = verifySessionToken(token);
    if (!session) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { searchParams } = new URL(request.url);
    const plantId = searchParams.get('plantId');
    const machineId = searchParams.get('machineId');

    const encoder = new TextEncoder();
    let lastEventKey = '';
    let heartbeatFailures = 0;
    const MAX_HEARTBEAT_FAILURES = 3;

    const stream = new ReadableStream({
        start(controller) {
            const welcome = `data: ${JSON.stringify({ type: 'connected', user: session.username, timestamp: new Date() })}\n\n`;
            controller.enqueue(encoder.encode(welcome));

            const unsubscribe = eventBus.subscribe('*', (event: MESEvent) => {
                if (plantId && event.plantId && event.plantId !== plantId) return;
                if (machineId && event.machineId && event.machineId !== machineId) return;
                const eventKey = buildEventDedupKey(event);
                if (eventKey === lastEventKey) return;
                lastEventKey = eventKey;

                const data = `id: ${Date.now()}\ndata: ${JSON.stringify(event)}\n\n`;
                try {
                    controller.enqueue(encoder.encode(data));
                } catch {
                    unsubscribe();
                }
            });

            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': heartbeat\n\n'));
                    heartbeatFailures = 0;
                } catch {
                    heartbeatFailures += 1;
                    if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
                        clearInterval(heartbeat);
                        unsubscribe();
                        try { controller.close(); } catch { /* already closed */ }
                    }
                }
            }, 15000);

            request.signal.addEventListener('abort', () => {
                clearInterval(heartbeat);
                unsubscribe();
                try { controller.close(); } catch { /* already closed */ }
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            // No Access-Control-Allow-Origin — same-origin only
        },
    });
}
