import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { onNDEResult } from '@/lib/spoolFlow';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { CreateNDESchema, validationError } from '@/lib/validation';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { AuditService } from '@/lib/services/AuditService';

export async function GET(req: NextRequest) {
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

    const records = await prisma.nDERecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { joint: { select: { jointId: true, spoolId: true } } },
    });
    return apiSuccess({ records });
  } catch (e) {
    return apiError('Failed to fetch NDE records', 'NDE_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
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
        await onNDEResult(record.jointId, data.result, data.holdFlag ?? false, record.id).catch(() => {});
      }
      return apiSuccess({ record });
    }

    if (id) {
      const record = await prisma.nDERecord.update({ where: { id }, data });
      return apiSuccess({ record });
    }

    // RBAC: creating NDE records requires QC+
    const guard = await requireSpoolAction('CREATE_NDE');
    if (guard instanceof NextResponse) return guard;

    // Validate payload
    const parsed = CreateNDESchema.safeParse(data);
    if (!parsed.success) return validationError(parsed.error);

    // Map frontend fields → schema fields
    const payload: any = { ...data };
    if (payload.remarks) { payload.notes = payload.remarks; delete payload.remarks; }
    if (payload.reportNumber) { payload.ndeNumber = payload.reportNumber; delete payload.reportNumber; }
    if (payload.ndeContractor) { delete payload.ndeContractor; }
    if (payload.ndeOperator) { payload.inspector = payload.ndeOperator; delete payload.ndeOperator; }

    const record = await prisma.nDERecord.create({ data: payload });
    if (record.jointId && payload.result) {
      await onNDEResult(record.jointId, payload.result, payload.holdFlag ?? false, record.id).catch(() => {});
    }
    return apiSuccess({ record });
  } catch (e: any) {
    return apiError('Failed to save NDE record', 'NDE_SAVE_FAILED', 500);
  }
}
