import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { onNDEResult } from '@/lib/spoolFlow';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { CreateNDESchema, validationError } from '@/lib/validation';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { requireRole } from '@/lib/api-auth';
import { parsePagination } from '@/lib/pagination';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

// Joint must have been welded before NDE can be performed
const NDE_ALLOWED_JOINT_STATUSES = ['WELDED', 'NDE_PENDING', 'REPAIR'];

function normalizeNDEPayload(data: Record<string, unknown>) {
  const payload: Record<string, unknown> = { ...data };

  if (payload.remarks && !payload.notes) payload.notes = payload.remarks;
  delete payload.remarks;

  if (payload.reportNumber && !payload.ndeNumber) payload.ndeNumber = payload.reportNumber;
  delete payload.reportNumber;

  if (payload.ndeOperator && !payload.inspector) payload.inspector = payload.ndeOperator;
  delete payload.ndeOperator;

  delete payload.ndeContractor;

  return payload;
}

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const jointId = searchParams.get('jointId');
    const result = searchParams.get('result');
    const ndeType = searchParams.get('ndeType');
    const holdOnly = searchParams.get('holdOnly') === 'true';

    if (id) {
      const record = await prisma.nDERecord.findUnique({
        where: { id },
        include: {
          joint: { include: { spool: { select: { spoolId: true } } } },
          documents: true,
        },
      });
      if (!record) return apiError('Not found', 'NDE_NOT_FOUND', 404);
      return apiSuccess({ record });
    }

    const where: any = {};
    if (jointId) where.jointId = jointId;
    if (result) where.result = result;
    if (ndeType) where.ndeType = ndeType;
    if (holdOnly) where.holdFlag = true;

    const { take, skip } = parsePagination(searchParams);
    const [records, total] = await Promise.all([
      prisma.nDERecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { joint: { select: { jointId: true, spoolId: true } } },
        take,
        skip,
      }),
      prisma.nDERecord.count({ where }),
    ]);
    return apiSuccess({ records, total, limit: take, offset: skip });
  } catch {
    return apiError('Failed to fetch NDE records', 'NDE_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'update_result' && id) {
      // Only QUALITY/SUPERVISOR/ADMIN can approve or reject NDE
      const resultGuard = data.result === 'ACCEPTABLE'
        ? await requireSpoolAction('APPROVE_NDE')
        : await requireSpoolAction('REJECT_NDE');
      if (resultGuard instanceof NextResponse) return resultGuard;

      const before = await prisma.nDERecord.findUnique({ where: { id } });
      if (!before) return apiError('NDE record not found', 'NDE_NOT_FOUND', 404);
      const record = await prisma.nDERecord.update({
        where: { id },
        data: {
          result: data.result,
          holdFlag: data.holdFlag ?? false,
          notes: data.notes,
          reportPath: data.reportPath,
        },
      });
      await AuditService.logChange({
        action: 'NDE_UPDATE_RESULT',
        entity: 'NDERecord',
        entityId: record.id,
        before,
        after: record,
        userId: resultGuard.userId,
      });
      if (record.jointId && data.result) {
        await onNDEResult(record.jointId, data.result, data.holdFlag ?? false).catch(() => {});
      }
      return apiSuccess({ record });
    }

    if (id) {
      // CRIT-3 fix: this fallback had no permission check at all, letting any
      // spool role (incl. OPERATOR) set `result`/`holdFlag` directly, bypassing
      // APPROVE_NDE/REJECT_NDE. Gate with CREATE_NDE (QC+) for general field
      // edits and strip the result-defining fields — those must go through
      // the guarded update_result action above.
      const guard = await requireSpoolAction('CREATE_NDE');
      if (guard instanceof NextResponse) return guard;
      const { result: _result, holdFlag: _holdFlag, ...safeData } = data;
      const record = await prisma.nDERecord.update({ where: { id }, data: safeData });
      return apiSuccess({ record });
    }

    // RBAC: creating NDE records requires QC+
    const guard = await requireSpoolAction('CREATE_NDE');
    if (guard instanceof NextResponse) return guard;

    // Status guard: joint must be WELDED/NDE_PENDING/REPAIR before NDE can be performed
    if (data.jointId) {
      const joint = await prisma.spoolJoint.findUnique({
        where: { id: data.jointId },
        select: { status: true, jointId: true },
      });
      if (!joint) return apiError('Joint not found', 'JOINT_NOT_FOUND', 404);
      if (!NDE_ALLOWED_JOINT_STATUSES.includes(joint.status)) {
        return apiError(
          `Cannot create NDE record - joint ${joint.jointId} is in '${joint.status}' status. Joint must be WELDED before NDE can be performed.`,
          'FLOW_ERROR',
          422,
        );
      }
    }

    const normalizedPayload = normalizeNDEPayload(data as Record<string, unknown>);
    const parsed = CreateNDESchema.safeParse(normalizedPayload);
    if (!parsed.success) return validationError(parsed.error);

    const record = await prisma.nDERecord.create({ data: parsed.data });
    await AuditService.log(
      EventType.AUDIT_CHANGE,
      'NDE record created',
      { ndeId: record.id, jointId: record.jointId, ndeType: record.ndeType },
      guard.userId,
    );
    if (record.jointId && parsed.data.result) {
      await onNDEResult(record.jointId, parsed.data.result, parsed.data.holdFlag ?? false).catch(() => {});
    }
    return apiSuccess({ record });
  } catch {
    return apiError('Failed to save NDE record', 'NDE_SAVE_FAILED', 500);
  }
}
