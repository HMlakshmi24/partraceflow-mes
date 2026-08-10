import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';

const ACTIVITY_READ_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY'];
const ACTIVITY_WRITE_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ACTIVITY_READ_ROLES);
    if (authError) return authError;

    const { id } = await params;
    try {
        const activities = await prisma.orderActivity.findMany({
            where: { orderId: id },
            orderBy: { timestamp: 'asc' },
        });
        return NextResponse.json(activities);
    } catch {
        return NextResponse.json({ error: 'Failed to retrieve activity log' }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ACTIVITY_WRITE_ROLES);
    if (authError) return authError;

    const { id } = await params;
    try {
        const body = await req.json();
        const performedBy = req.headers.get('x-mes-username') ?? 'system';
        const role        = req.headers.get('x-mes-role')     ?? 'SYSTEM';
        const userId      = req.headers.get('x-mes-user-id')  ?? undefined;

        if (!body.notes || typeof body.notes !== 'string' || body.notes.trim().length === 0) {
            return NextResponse.json(
                { error: 'Activity notes are required', code: 'NOTES_REQUIRED' },
                { status: 400 }
            );
        }

        const order = await prisma.workOrder.findUnique({ where: { id }, select: { id: true } });
        if (!order) {
            return NextResponse.json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' }, { status: 404 });
        }

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
                notes:       body.notes.trim(),
            }
        });

        await prisma.systemEvent.create({
            data: {
                eventType: 'ORDER_NOTE',
                details: JSON.stringify({
                    orderId: id,
                    action: body.action ?? 'NOTE',
                    performedBy,
                    role,
                    notes: body.notes.trim(),
                    timestamp: new Date().toISOString(),
                }),
                userId,
            },
        }).catch(() => {});

        return NextResponse.json(activity, { status: 201 });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: `Failed to add activity: ${message}`, code: 'ACTIVITY_CREATE_FAILED' }, { status: 500 });
    }
}
