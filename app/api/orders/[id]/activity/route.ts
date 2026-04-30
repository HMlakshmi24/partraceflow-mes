import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const activities = await prisma.orderActivity.findMany({
            where: { orderId: id },
            orderBy: { timestamp: 'asc' },
        });
        return NextResponse.json(activities);
    } catch {
        return NextResponse.json([], { status: 200 });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const body = await req.json();
        const performedBy = req.headers.get('x-mes-username') ?? body.performedBy ?? 'system';
        const role        = req.headers.get('x-mes-role')     ?? body.role        ?? 'SYSTEM';

        const activity = await prisma.orderActivity.create({
            data: {
                orderId:     id,
                action:      body.action     ?? 'NOTE',
                fromStatus:  body.fromStatus ?? null,
                toStatus:    body.toStatus   ?? null,
                performedBy,
                role,
                machine:     body.machine    ?? null,
                operator:    body.operator   ?? null,
                notes:       body.notes      ?? null,
            }
        });
        return NextResponse.json(activity, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
