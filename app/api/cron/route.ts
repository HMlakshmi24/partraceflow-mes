import { NextRequest, NextResponse } from 'next/server';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.cron');

// HIGH-1 fix: this route is invoked by Vercel Cron (or any external
// scheduler) with only an `Authorization: Bearer <CRON_SECRET>` header — it
// never carries a session cookie, so requireRole(['ADMIN']) could never be
// satisfied by the actual caller. It previously also sat behind
// middleware.ts's session gate (this path is now in PUBLIC_PATHS), which
// meant the scheduled job could never run in production. The bearer-secret
// check below is this route's sole — and sufficient — authentication.
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
        // HIGH-11 fix: don't leak raw internal error text (Prisma messages
        // routinely include table/column names) to the response body.
        log.error('cron job failed', { message: e instanceof Error ? e.message : String(e) });
        return NextResponse.json({ error: 'Cron job failed — see server logs.' }, { status: 500 });
    }
}
