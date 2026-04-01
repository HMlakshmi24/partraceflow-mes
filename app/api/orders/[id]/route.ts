import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const order = await prisma.workOrder.findUnique({
            where: { id },
            include: {
                product: true,
                workflowInstances: {
                    include: {
                        tasks: {
                            include: { stepDef: true },
                            orderBy: { startTime: 'asc' }
                        }
                    }
                }
            }
        });
        if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(order);
    } catch {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const { status } = await req.json();
        const valid = ['RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD'];
        if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

        const order = await prisma.workOrder.update({ where: { id }, data: { status } });

        await prisma.systemEvent.create({
            data: {
                eventType: 'ORDER_STATUS_CHANGE',
                details: `Order ${order.orderNumber} status changed to ${status}`
            }
        });

        return NextResponse.json(order);
    } catch {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
