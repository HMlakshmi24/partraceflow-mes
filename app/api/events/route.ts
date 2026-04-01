import { NextRequest } from 'next/server';
import { prisma } from '@/lib/services/database';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PUSH_INTERVAL_MS = 4000;
const MAX_CONNECT_MS = 5 * 60 * 1000; // 5 min max

function sse(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * GET /api/events — Server-Sent Events stream for real-time dashboard updates.
 * Pushes machine statuses, active andon alerts, and active work orders every 4 seconds.
 *
 * Usage in React:
 *   const es = new EventSource('/api/events');
 *   es.addEventListener('machines', e => setMachines(JSON.parse(e.data)));
 */
export async function GET(req: NextRequest) {
    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                if (closed) return;
                try { controller.enqueue(encoder.encode(sse(event, data))); } catch { /* closed */ }
            };

            send('connected', { ts: Date.now() });

            const push = async () => {
                if (closed) return;
                try {
                    const [machines, alerts, orders] = await Promise.all([
                        prisma.machine.findMany({
                            select: { id: true, code: true, name: true, status: true, oee: true },
                            orderBy: { code: 'asc' },
                        }),
                        prisma.andonEvent.findMany({
                            select: { id: true, boardId: true, machineId: true, triggeredBy: true, severity: true, message: true, timestamp: true },
                            orderBy: { timestamp: 'desc' },
                            take: 10,
                        }),
                        prisma.workOrder.findMany({
                            where: { status: { in: ['IN_PROGRESS', 'RELEASED'] } },
                            select: { id: true, orderNumber: true, status: true, quantity: true, priority: true },
                            take: 10,
                        }),
                    ]);
                    send('machines', machines);
                    send('andon', alerts);
                    send('orders', orders);
                    send('ping', { ts: Date.now() });
                } catch { /* skip tick on DB error */ }
            };

            await push();
            const timer = setInterval(push, PUSH_INTERVAL_MS);
            const maxTimer = setTimeout(() => {
                closed = true; clearInterval(timer);
                try { controller.close(); } catch { /* ok */ }
            }, MAX_CONNECT_MS);

            req.signal.addEventListener('abort', () => {
                closed = true; clearInterval(timer); clearTimeout(maxTimer);
                try { controller.close(); } catch { /* ok */ }
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

/**
 * POST /api/events — Accept simulated hardware / external system events.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { source, eventType, details } = body;
        await prisma.systemEvent.create({
            data: { eventType: eventType || 'HW_EVENT', details: JSON.stringify({ source, details }) }
        });
        return Response.json({ success: true });
    } catch (e) {
        return Response.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}
