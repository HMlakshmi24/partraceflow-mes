import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const encoder = new TextEncoder();

    const customReadable = new ReadableStream({
        start(controller) {
            // Send initial connection message
            controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

            const interval = setInterval(() => {
                // In a real app, we check for DB updates here
                // For now, we just send a "heartbeat" or mock data
                const msg = JSON.stringify({ type: 'heartbeat', time: new Date().toISOString() });
                controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
            }, 2000);

            request.signal.addEventListener('abort', () => {
                clearInterval(interval);
                controller.close();
            });
        },
    });

    return new NextResponse(customReadable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
