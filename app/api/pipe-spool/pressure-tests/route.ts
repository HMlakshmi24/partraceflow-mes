import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { onPressureTestResult } from '@/lib/spoolFlow';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { CreatePressureTestSchema, validationError } from '@/lib/validation';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { AuditService } from '@/lib/services/AuditService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const spoolId = searchParams.get('spoolId');
    const result = searchParams.get('result');
    const testType = searchParams.get('testType');

    if (id) {
      const record = await prisma.pressureTestRecord.findUnique({
        where: { id },
        include: {
          spool: { select: { spoolId: true, lineId: true } },
          documents: true,
          approvals: true,
        },
      });
      if (!record) return apiError('Not found', 'PRESSURE_TEST_NOT_FOUND', 404);
      return apiSuccess({ record });
    }

    const where: any = {};
    if (spoolId) where.spoolId = spoolId;
    if (result) where.result = result;
    if (testType) where.testType = testType;

    const records = await prisma.pressureTestRecord.findMany({
      where,
      orderBy: { testDate: 'desc' },
      include: { spool: { select: { spoolId: true } } },
    });
    return apiSuccess({ records });
  } catch (e) {
    return apiError('Failed to fetch pressure test records', 'PRESSURE_TEST_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'update_result' && id) {
      const guard = await requireSpoolAction('APPROVE_PRESSURE_TEST');
      if (guard instanceof NextResponse) return guard;
      const before = await prisma.pressureTestRecord.findUnique({ where: { id } });
      if (!before) return apiError('Pressure test not found', 'PRESSURE_TEST_NOT_FOUND', 404);
      const record = await prisma.pressureTestRecord.update({
        where: { id },
        data: {
          result: data.result,
          notes: data.notes,
          certificatePath: data.certificatePath,
        },
      });
      await AuditService.logChange({
        action: 'PRESSURE_TEST_UPDATE_RESULT',
        entity: 'PressureTestRecord',
        entityId: record.id,
        before,
        after: record,
        userId: guard.userId,
      });
      // Flow: advance spool status based on test outcome
      if (record.spoolId && data.result) {
        await onPressureTestResult(record.spoolId, data.result).catch(() => {});
      }
      return apiSuccess({ record });
    }

    if (id) {
      const record = await prisma.pressureTestRecord.update({ where: { id }, data });
      return apiSuccess({ record });
    }

    // RBAC: only QC+ can create pressure test records
    const createGuard = await requireSpoolAction('CREATE_PRESSURE_TEST');
    if (createGuard instanceof NextResponse) return createGuard;

    // Validate payload
    const parsed = CreatePressureTestSchema.safeParse(data);
    if (!parsed.success) return validationError(parsed.error);

    // Map frontend fields → schema fields
    const payload: any = { ...data };
    if (payload.remarks) { payload.notes = payload.remarks; delete payload.remarks; }
    if (payload.testedBy) { payload.witnessedBy = payload.testedBy; delete payload.testedBy; }

    const record = await prisma.pressureTestRecord.create({ data: payload });
    // Flow: if result set on creation
    if (record.spoolId && payload.result) {
      await onPressureTestResult(record.spoolId, payload.result).catch(() => {});
    }
    return apiSuccess({ record });
  } catch (e: any) {
    return apiError('Failed to save pressure test record', 'PRESSURE_TEST_SAVE_FAILED', 500);
  }
}
