import { NextRequest, NextResponse } from 'next/server';
import { seedDemoData, runDemoTick, getDemoStatus } from '@/lib/services/DemoService';

export async function GET() {
    try {
        const status = await getDemoStatus();
        return NextResponse.json(status);
    } catch (error) {
        console.error('[GET /api/demo]', error);
        return NextResponse.json({ error: 'Failed to get demo status' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'seed': {
                const result = await seedDemoData();
                return NextResponse.json(result);
            }
            case 'tick': {
                const result = await runDemoTick();
                return NextResponse.json(result);
            }
            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error) {
        console.error('[POST /api/demo]', error);
        return NextResponse.json({ error: 'Demo action failed', detail: String(error) }, { status: 500 });
    }
}
