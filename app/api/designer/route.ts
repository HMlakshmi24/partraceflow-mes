import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('designer');

/**
 * Designer API
 * POST -> save workflow (name, payload)
 * GET  -> list saved workflows or fetch by ?name=
 */
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR']);
    if (authError) return authError as NextResponse;

    try {
        const body = await req.json();
        const { name, payload } = body;

        if (!name || !payload) {
            return new Response(JSON.stringify({ success: false, error: 'name and payload required' }), { status: 400 });
        }

        const existing = await prisma.workflowDefinition.findFirst({ where: { name } });

        if (existing) {
            const updated = await prisma.workflowDefinition.update({
                where: { id: existing.id },
                data: { payload }
            });
            return new Response(JSON.stringify({ success: true, workflow: { id: updated.id, name: updated.name } }), { status: 200 });
        } else {
            const created = await prisma.workflowDefinition.create({ data: { name, payload } });
            return new Response(JSON.stringify({ success: true, workflow: { id: created.id, name: created.name } }), { status: 200 });
        }
    } catch (e) {
        log.error('designer save error', { message: e instanceof Error ? e.message : String(e) });
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const name = url.searchParams.get('name');

        if (name) {
            const wf = await prisma.workflowDefinition.findFirst({ where: { name } });
            if (!wf) return new Response(JSON.stringify({ success: false, error: 'not found' }), { status: 404 });
            return new Response(JSON.stringify({ success: true, workflow: { name: wf.name, payload: wf.payload } }), { status: 200 });
        }

        const list = await prisma.workflowDefinition.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
        const simplified = list.map(l => ({ id: l.id, name: l.name, createdAt: l.createdAt }));
        return new Response(JSON.stringify({ success: true, list: simplified }), { status: 200 });
    } catch (e) {
        log.error('designer list error', { message: e instanceof Error ? e.message : String(e) });
        return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500 });
    }
}
