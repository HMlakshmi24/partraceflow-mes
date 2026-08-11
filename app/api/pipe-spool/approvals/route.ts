import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { ApproveSpoolSchema, validationError } from '@/lib/validation';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { AuditService } from '@/lib/services/AuditService';
import { requireRole } from '@/lib/api-auth';
import { parsePagination } from '@/lib/pagination';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const spoolId = searchParams.get('spoolId');
    const jointId = searchParams.get('jointId');
    const pressureTestId = searchParams.get('pressureTestId');
    const inspectionId = searchParams.get('inspectionId');
    const status = searchParams.get('status');

    const where: any = {};
    if (spoolId) where.spoolId = spoolId;
    if (jointId) where.jointId = jointId;
    if (pressureTestId) where.pressureTestId = pressureTestId;
    if (inspectionId) where.inspectionId = inspectionId;
    if (status) where.status = status;

    const { take, skip } = parsePagination(searchParams);
    const [approvals, total] = await Promise.all([
      prisma.spoolApproval.findMany({
        where,
        orderBy: { approvedAt: 'desc' },
        take,
        skip,
      }),
      prisma.spoolApproval.count({ where }),
    ]);
    return apiSuccess({ approvals, total, limit: take, offset: skip });
  } catch (e) {
    return apiError('Failed to fetch approvals', 'APPROVAL_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = ApproveSpoolSchema.safeParse(body);
    if (parsed.success) {
      const { spoolId, action, remarks } = parsed.data;
      const guard = await requireSpoolAction(action === 'APPROVE' ? 'APPROVE_SPOOL' : 'REJECT_SPOOL');
      if (guard instanceof NextResponse) return guard;

      const approverRole = guard.role;
      const approverName = guard.username ?? guard.role;
      const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

      const existing = await prisma.spoolApproval.findFirst({
        where: { spoolId, approverRole },
      });

      const approval = existing
        ? await prisma.spoolApproval.update({
            where: { id: existing.id },
            data: {
              status,
              approvedAt: new Date(),
              comments: remarks,
              approverName,
              approverUserId: guard.userId,
            },
          })
        : await prisma.spoolApproval.create({
            data: {
              relatedType: 'SPOOL',
              spoolId,
              approverRole,
              approverName,
              approverUserId: guard.userId,
              status,
              comments: remarks,
            },
          });

      await AuditService.logChange({
        action: `SPOOL_${action}`,
        entity: 'SpoolApproval',
        entityId: approval.id,
        before: existing ?? null,
        after: approval,
        userId: guard.userId,
      });

      return apiSuccess({ approval });
    }

    if (body?.action === 'APPROVE' || body?.action === 'REJECT') {
      return validationError(parsed.error);
    }

    const { action, id, ...data } = body;

    if (action === 'approve' && id) {
      const guard = await requireSpoolAction('APPROVE_SPOOL');
      if (guard instanceof NextResponse) return guard;
      const before = await prisma.spoolApproval.findUnique({ where: { id } });
      if (!before) return apiError('Approval not found', 'APPROVAL_NOT_FOUND', 404);
      const approval = await prisma.spoolApproval.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          signature: data.signature,
          comments: data.comments,
          approverName: guard.username ?? guard.role,
          approverUserId: guard.userId,
        },
      });
      await AuditService.logChange({
        action: 'SPOOL_APPROVE',
        entity: 'SpoolApproval',
        entityId: approval.id,
        before,
        after: approval,
        userId: guard.userId,
      });
      return apiSuccess({ approval });
    }

    if (action === 'reject' && id) {
      const guard = await requireSpoolAction('REJECT_SPOOL');
      if (guard instanceof NextResponse) return guard;
      const before = await prisma.spoolApproval.findUnique({ where: { id } });
      if (!before) return apiError('Approval not found', 'APPROVAL_NOT_FOUND', 404);
      const approval = await prisma.spoolApproval.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedAt: new Date(),
          comments: data.comments,
          approverName: guard.username ?? guard.role,
          approverUserId: guard.userId,
        },
      });
      await AuditService.logChange({
        action: 'SPOOL_REJECT',
        entity: 'SpoolApproval',
        entityId: approval.id,
        before,
        after: approval,
        userId: guard.userId,
      });
      return apiSuccess({ approval });
    }

    // ── bare id update / create (non-status field patch) ─────────────────────
    // Approval/rejection of a record must go through the approve/reject actions
    // above; strip status-defining fields here so this fallback can't be used
    // to self-approve (CRIT-3 fix).
    if (id) {
      const guard = await requireSpoolAction('APPROVE_SPOOL');
      if (guard instanceof NextResponse) return guard;
      const { status: _status, approvedAt: _approvedAt, approverName: _approverName, signature: _signature, ...safeData } = data;
      const approval = await prisma.spoolApproval.update({ where: { id }, data: safeData });
      return apiSuccess({ approval });
    }

    const guard = await requireSpoolAction('APPROVE_SPOOL');
    if (guard instanceof NextResponse) return guard;
    // Bug fix (found via audit): approverName/approverRole here came straight
    // from the client body, unlike every other create/update path in this
    // route — the same attribution-spoofing class of bug already fixed
    // elsewhere (recipes/route.ts, mdr/route.ts). Force it from the session.
    const { approverName: _clientApproverName, approverRole: _clientApproverRole, approverUserId: _clientApproverUserId, ...safeData } = data;
    const approval = await prisma.spoolApproval.create({
      data: { ...safeData, approverName: guard.username ?? guard.role, approverRole: guard.role, approverUserId: guard.userId },
    });
    return apiSuccess({ approval });
  } catch (e: any) {
    if (e?.name === 'ZodError') return validationError(e);
    return apiError('Failed to save approval', 'APPROVAL_SAVE_FAILED', 500);
  }
}
