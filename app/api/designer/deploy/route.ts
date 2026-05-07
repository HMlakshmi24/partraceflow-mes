import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
    const authError = requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR']);
    if (authError) return authError as NextResponse;

    try {
        const body = await req.json();
        const { name } = body;
        if (!name) return new Response(JSON.stringify({ success: false, error: 'name required' }), { status: 400 });

        await prisma.systemEvent.create({ data: { eventType: 'DEPLOY_WORKFLOW', details: `Deployed ${name}` } });

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
        console.error('designer deploy API error:', e);
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
}
