import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { validateQualityCheck } from '@/lib/utils/validation';
import { eventBus } from '@/lib/events/EventBus';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    const resultFilter = searchParams.get('result');
    const limit = parseInt(searchParams.get('limit') ?? '50');

    try {
        // ?result=FAIL — return QualityCheck records filtered by result
        if (resultFilter) {
            const checks = await prisma.qualityCheck.findMany({
                where: { result: resultFilter },
                orderBy: { id: 'desc' },
                take: limit,
            });
            return NextResponse.json({ checks });
        }

        if (orderId) {
            const records = await prisma.inspectionRecord.findMany({
                where: { workOrderId: orderId },
                orderBy: { createdAt: 'desc' }
            });
            return NextResponse.json(records);
        }

        // Return all inspectable orders (exclude only CANCELLED)
        const orders = await prisma.workOrder.findMany({
            where: { status: { notIn: ['CANCELLED'] } },
            include: { product: true },
            orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
            take: 100
        });

        return NextResponse.json(orders);
    } catch {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, workOrderId, inspector, result, notes, measurements, visualChecks, defectType } = body;

        if (action === 'task_qc') {
            const qcPayload = {
                taskId: body.taskId,
                parameter: body.parameter ?? 'Visual Inspection',
                expected: body.expected ?? 'PASS',
                actual: body.actual ?? body.result,
                result: body.result,
            };

            const parsed = validateQualityCheck(qcPayload);
            if (!parsed.success) {
                return NextResponse.json({ error: 'Invalid quality check', issues: parsed.error.issues }, { status: 400 });
            }

            const qc = await prisma.qualityCheck.create({ data: parsed.data });
            await prisma.systemEvent.create({
                data: {
                    eventType: 'QUALITY_CHECK',
                    details: `Task ${qc.taskId} quality ${qc.result} (${qc.parameter})`,
                }
            });

            eventBus.publish({
                type: qc.result === 'PASS' ? 'quality.approved' : 'quality.failed',
                source: 'QualityAPI',
                payload: { taskId: qc.taskId, result: qc.result, parameter: qc.parameter }
            });

            return NextResponse.json({ success: true, qualityCheck: qc });
        }

        if (!workOrderId || !result) {
            return NextResponse.json({ error: 'workOrderId and result required' }, { status: 400 });
        }

        const record = await prisma.inspectionRecord.create({
            data: {
                workOrderId,
                inspector: inspector || 'Inspector_01',
                result,
                notes: notes || null,
                defectType: defectType || null,
                measurements: measurements ? JSON.stringify(measurements) : null,
                visualChecks: visualChecks ? JSON.stringify(visualChecks) : null,
            }
        });

        // Auto-update work order status
        const newStatus = result === 'PASS' ? 'COMPLETED' : result === 'FAIL' ? 'CANCELLED' : 'ON_HOLD';
        const order = await prisma.workOrder.update({
            where: { id: workOrderId },
            data: { status: newStatus }
        });

        await prisma.systemEvent.create({
            data: {
                eventType: 'QUALITY_CHECK',
                details: `Quality inspection ${result} for order ${order.orderNumber}`
            }
        });

        return NextResponse.json({ success: true, record, orderStatus: newStatus });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Failed to submit inspection' }, { status: 500 });
    }
}
