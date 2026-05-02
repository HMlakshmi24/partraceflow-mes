import { NextRequest, NextResponse } from 'next/server';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';

// Called by Vercel Cron or manually — runs automated triggers
// Set in vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "*/5 * * * *" }] }
export async function GET(req: NextRequest) {
    // Verify cron secret to prevent unauthorized calls
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
