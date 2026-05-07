import { NextRequest, NextResponse } from 'next/server';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;

    // H1: Reject all requests if CRON_SECRET is not configured — prevents open execution
    if (!cronSecret) {
        return NextResponse.json(
            { error: 'CRON_SECRET is not set. Configure it in Vercel environment settings.' },
            { status: 503 }
        );
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await OrderLifecycleService.flagOverdueOrders();
        return NextResponse.json({ ok: true, ran: ['flagOverdueOrders'], at: new Date().toISOString() });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
