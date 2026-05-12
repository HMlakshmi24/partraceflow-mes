import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { validateQualityCheck } from '@/lib/utils/validation';
import { eventBus } from '@/lib/events/EventBus';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { requireRole } from '@/lib/api-auth';

const ORDER_QC_ROLES = ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'];

/**
 * Check if quality inspection can be submitted for a task.
 * QC PASS requires task to be COMPLETED and no prior PASS for this task.
 * QC FAIL can be submitted anytime (defects discovered during work).
 */
async function canSubmitQuality(taskId: string, result: string): Promise<{ allowed: boolean; reason?: string; code?: string }> {
    const task = await prisma.workflowTask.findUnique({
        where: { id: taskId },
        select: { status: true, stepDef: { select: { name: true } } }
    });

    if (!task) {
        return { allowed: false, reason: 'Task not found — it may have been deleted or the ID is incorrect.', code: 'TASK_NOT_FOUND' };
    }

    // QC FAIL can always be submitted (defects discovered during or after work)
    if (result === 'FAIL') {
        return { allowed: true };
    }

    // QC PASS requires task to be COMPLETED first
    if (task.status !== 'COMPLETED') {
        const stepName = task.stepDef?.name ?? 'this task';
        return {
            allowed: false,
            reason: `Cannot submit QC PASS — "${stepName}" is still "${task.status}". The operator must complete the task before quality inspection can be passed.`,
            code: 'TASK_NOT_COMPLETED',
        };
    }

    // Prevent duplicate QC PASS for the same task
    const existingPass = await prisma.qualityCheck.findFirst({
        where: { taskId, result: 'PASS' },
        select: { id: true },
    });
    if (existingPass) {
        return {
            allowed: false,
            reason: 'A QC PASS has already been recorded for this task. Duplicate approvals are not permitted. If a re-inspection is required, raise a QC FAIL first.',
            code: 'DUPLICATE_QC_PASS',
        };
    }

    return { allowed: true };
}

export async function GET(req: NextRequest) {
  const authError = requireRole(req, ['ADMIN', 'SUPERVISOR', 'QC', 'QUALITY', 'OPERATOR', 'PLANNER']);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  const resultFilter = searchParams.get('result');
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50') || 50));

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
    return NextResponse.json({ error: 'Failed to retrieve quality records', code: 'SERVER_ERROR' }, { status: 500 });
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

      // H2: task-level QC requires a QC-capable role — plain PLANNERs cannot submit results
      const TASK_QC_ROLES = ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN', 'OPERATOR'];
      if (!TASK_QC_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role ${role} cannot submit quality results. Required: ${TASK_QC_ROLES.join(', ')}.` },
          { status: 403 }
        );
      }

      // First check if quality can be submitted based on task status
      const qualityGate = await canSubmitQuality(taskId, qcResult);
      if (!qualityGate.allowed) {
        await AuditService.log(
            EventType.QUALITY_FAIL,
            `Quality ${qcResult} rejected for task ${taskId}: ${qualityGate.reason}`,
            { taskId, result: qcResult, reason: qualityGate.reason, code: qualityGate.code, performedBy },
            userId
        );
        return NextResponse.json(
            { error: qualityGate.reason, code: qualityGate.code ?? 'QC_GATE_BLOCKED' },
            { status: 422 }
        );
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

      // For QC PASS: re-validate task status and duplicate check atomically inside a transaction
      // to eliminate the race condition between canSubmitQuality() and record creation.
      let qc;
      if (qcResult === 'PASS') {
        try {
          qc = await prisma.$transaction(async (tx) => {
            const taskNow = await tx.workflowTask.findUnique({
              where: { id: taskId },
              select: { status: true, stepDef: { select: { name: true } } },
            });
            if (!taskNow) throw new Error('Task not found');
            if (taskNow.status !== 'COMPLETED') {
              throw new Error(
                `Cannot submit QC PASS — "${taskNow.stepDef?.name ?? 'task'}" status changed to "${taskNow.status}" before the record could be saved. Please refresh and retry.`,
              );
            }
            const existingPass = await tx.qualityCheck.findFirst({
              where: { taskId, result: 'PASS' },
              select: { id: true },
            });
            if (existingPass) {
              throw new Error('A QC PASS was already recorded concurrently. Duplicate approvals are not permitted.');
            }
            return tx.qualityCheck.create({ data: parsed.data });
          });
        } catch (txErr) {
          const msg = txErr instanceof Error ? txErr.message : 'QC transaction failed';
          return NextResponse.json({ error: msg, code: 'QC_ATOMIC_VALIDATION_FAILED' }, { status: 422 });
        }
      } else {
        qc = await prisma.qualityCheck.create({ data: parsed.data });
      }

      await AuditService.log(
        qcResult === 'PASS' ? EventType.QUALITY_PASS : EventType.QUALITY_FAIL,
        `Task ${taskId} quality ${qcResult} by ${performedBy} (${qc.parameter})`,
        { taskId, result: qcResult, parameter: qc.parameter, performedBy, submittedAt: new Date().toISOString() },
        userId
      );
      await AuditService.logDiffs({
        entityType: 'QualityCheck',
        entityId: qc.id,
        before: { result: null, parameter: qc.parameter, actual: null },
        after: { result: qc.result, parameter: qc.parameter, actual: qc.actual },
        changedBy: performedBy,
        changedByRole: role,
        changedByUserId: userId,
        eventType: qcResult === 'PASS' ? 'QUALITY_PASS' : 'QUALITY_FAIL',
        summary: `QC ${qcResult} for task ${taskId} by ${performedBy}`,
      });
      
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

    // Guard: PASS requires order to be in QC_PENDING — all production steps must be complete
    if (result.toUpperCase() === 'PASS') {
      const orderForGuard = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { status: true },
      });
      if (!orderForGuard) {
        return NextResponse.json({ error: 'Work order not found', code: 'ORDER_NOT_FOUND' }, { status: 404 });
      }
      if (orderForGuard.status !== 'QC_PENDING') {
        return NextResponse.json({
          error: `Cannot submit QC PASS — order is in "${orderForGuard.status}" status. All production steps must be completed before quality can be approved.`,
          code: 'ORDER_NOT_QC_PENDING',
        }, { status: 422 });
      }
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
    console.error('[quality POST]', e);
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to submit quality inspection: ${message}`, code: 'SERVER_ERROR' }, { status: 500 });
  }
}
