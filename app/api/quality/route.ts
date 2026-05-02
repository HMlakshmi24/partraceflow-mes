import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { validateQualityCheck } from '@/lib/utils/validation';
import { eventBus } from '@/lib/events/EventBus';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { AuditService, EventType } from '@/lib/services/AuditService';

const ORDER_QC_ROLES = ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'];

/**
 * Check if quality inspection can be submitted for a task.
 * QC PASS requires task to be COMPLETED.
 * QC FAIL can be submitted anytime (defects discovered during work).
 */
async function canSubmitQuality(taskId: string, result: string): Promise<{ allowed: boolean; reason?: string }> {
    const task = await prisma.workflowTask.findUnique({
        where: { id: taskId },
        select: { status: true, stepDef: { select: { name: true } } }
    });

    if (!task) {
        return { allowed: false, reason: 'Task not found' };
    }

    // QC FAIL can always be submitted (discovered during work)
    if (result === 'FAIL') {
        return { allowed: true };
    }

    // QC PASS requires task to be COMPLETED
    if (task.status !== 'COMPLETED') {
        return { 
            allowed: false, 
            reason: `Cannot submit QC PASS - task status is "${task.status}". Complete the task first before passing quality.`
        };
    }

    return { allowed: true };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  const resultFilter = searchParams.get('result');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  try {
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
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json(records);
    }

    const orders = await prisma.workOrder.findMany({
      where: { status: { notIn: ['CANCELLED'] } },
      include: { product: true },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 100,
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

    const role = req.headers.get('x-mes-role') ?? 'SYSTEM';
    const performedBy = req.headers.get('x-mes-username') ?? inspector ?? 'system';
    const userId = req.headers.get('x-mes-user-id') ?? undefined;

if (action === 'task_qc') {
      const { taskId, result: qcResult } = body;
      
      // First check if quality can be submitted based on task status
      const qualityGate = await canSubmitQuality(taskId, qcResult);
      if (!qualityGate.allowed) {
        // Log the rejected quality attempt
        await AuditService.log(
            qcResult === 'PASS' ? EventType.QUALITY_FAIL : EventType.QUALITY_CHECK,
            `Quality ${qcResult} rejected for task ${taskId}: ${qualityGate.reason}`,
            { taskId, result: qcResult, reason: qualityGate.reason },
            userId
        );
        return NextResponse.json({ error: qualityGate.reason }, { status: 422 });
      }

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
      
      // Log quality check with full audit trail
      await AuditService.log(
        qcResult === 'PASS' ? EventType.QUALITY_PASS : EventType.QUALITY_FAIL,
        `Task ${taskId} quality ${qcResult} by ${performedBy} (${qc.parameter})`,
        { 
            taskId, 
            result: qcResult, 
            parameter: qc.parameter,
            performedBy,
            submittedAt: new Date().toISOString()
        },
        userId
      );
      
      await prisma.systemEvent.create({
        data: {
          eventType: 'QUALITY_CHECK',
          details: `Task ${qc.taskId} quality ${qc.result} (${qc.parameter})`,
          userId,
        },
      });

      const task = await prisma.workflowTask.findUnique({
        where: { id: qc.taskId },
        include: { instance: { include: { workOrder: true } } },
      });

      if (task?.instance.workOrder) {
        await OrderLifecycleService.onQualityInspection({
          workOrderId: task.instance.workOrder.id,
          result: qc.result,
          performedBy,
          role,
          userId,
          notes: body.notes ?? (qc.result === 'FAIL' ? `${qc.parameter} failed: ${qc.actual}` : undefined),
          defectType: qc.result === 'FAIL' ? (body.notes ?? qc.actual) : undefined,
        });
      }

      eventBus.publish({
        type: qc.result === 'PASS' ? 'quality.approved' : 'quality.failed',
        source: 'QualityAPI',
        payload: { taskId: qc.taskId, result: qc.result, parameter: qc.parameter },
      });

      return NextResponse.json({ success: true, qualityCheck: qc });
    }

    if (!workOrderId || !result) {
      return NextResponse.json({ error: 'workOrderId and result required' }, { status: 400 });
    }

    if (!ORDER_QC_ROLES.includes(role)) {
      return NextResponse.json({ error: `Role ${role} cannot submit order-level QC results` }, { status: 403 });
    }

    const record = await prisma.inspectionRecord.create({
      data: {
        workOrderId,
        inspector: inspector || performedBy,
        result,
        notes: notes || null,
        defectType: defectType || null,
        measurements: measurements ? JSON.stringify(measurements) : null,
        visualChecks: visualChecks ? JSON.stringify(visualChecks) : null,
      },
    });

    const nextStatus = await OrderLifecycleService.onQualityInspection({
      workOrderId,
      result,
      performedBy,
      role,
      userId,
      notes: notes || null,
      defectType: defectType || null,
    });

    await prisma.systemEvent.create({
      data: {
        eventType: 'QUALITY_CHECK',
        details: `Quality inspection ${result} for order ${workOrderId}`,
        userId,
      },
    });

    return NextResponse.json({ success: true, record, orderStatus: nextStatus });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to submit inspection' }, { status: 500 });
  }
}
