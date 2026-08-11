import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { CreateNCRSchema, validationError } from '@/lib/validation';
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
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const spoolId = searchParams.get('spoolId');
    const jointId = searchParams.get('jointId');

    if (id) {
      const ncr = await prisma.nCRRecord.findUnique({
        where: { id },
        include: {
          spool: { select: { spoolId: true } },
          joint: { select: { jointId: true } },
          documents: true,
          approvals: true,
        },
      });
      if (!ncr) return apiError('Not found', 'NCR_NOT_FOUND', 404);
      return apiSuccess({ ncr });
    }

    const where: any = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (spoolId) where.spoolId = spoolId;
    if (jointId) where.jointId = jointId;

    const { take, skip } = parsePagination(searchParams);
    const [ncrs, total] = await Promise.all([
      prisma.nCRRecord.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        include: {
          spool: { select: { spoolId: true } },
          joint: { select: { jointId: true } },
          _count: { select: { documents: true } },
        },
        take,
        skip,
      }),
      prisma.nCRRecord.count({ where }),
    ]);
    return apiSuccess({ ncrs, total, limit: take, offset: skip });
  } catch (e) {
    return apiError('Failed to fetch NCRs', 'NCR_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'close' && id) {
      // RBAC: only QUALITY, SUPERVISOR, ADMIN can close an NCR
      const guard = await requireSpoolAction('CLOSE_NCR');
      if (guard instanceof NextResponse) return guard;

      const before = await prisma.nCRRecord.findUnique({ where: { id } });
      if (!before) return apiError('NCR not found', 'NCR_NOT_FOUND', 404);
      const ncr = await prisma.nCRRecord.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: data.closedBy,
          rootCause: data.rootCause,
          disposition: data.disposition,
          correctiveAction: data.correctiveAction,
        },
      });
      await AuditService.logChange({
        action: 'NCR_CLOSE',
        entity: 'NCRRecord',
        entityId: ncr.id,
        before,
        after: ncr,
        userId: guard.userId,
      });
      return apiSuccess({ ncr });
    }

    if (action === 'update_status' && id) {
      // CRIT-3 fix: closing an NCR through this branch must require the same
      // CLOSE_NCR permission as the dedicated `close` action above; any other
      // status change requires at least RAISE_NCR (OPERATOR has neither).
      const guard = await requireSpoolAction(data.status === 'CLOSED' ? 'CLOSE_NCR' : 'RAISE_NCR');
      if (guard instanceof NextResponse) return guard;
      const ncr = await prisma.nCRRecord.update({
        where: { id },
        data: { status: data.status },
      });
      return apiSuccess({ ncr });
    }

    if (id) {
      // Bare-id patch: strip status so closing/reopening can't bypass the guards above.
      const guard = await requireSpoolAction('RAISE_NCR');
      if (guard instanceof NextResponse) return guard;
      const { status: _status, ...safeData } = data;
      const ncr = await prisma.nCRRecord.update({ where: { id }, data: safeData });
      return apiSuccess({ ncr });
    }

    // Raising an NCR requires RAISE_NCR (OPERATOR cannot raise NCRs).
    const guard = await requireSpoolAction('RAISE_NCR');
    if (guard instanceof NextResponse) return guard;

    // Validate create payload
    const parsed = CreateNCRSchema.safeParse(data);
    if (!parsed.success) return validationError(parsed.error);

    // Auto-generate NCR number: NCR-YYYY-NNNN
    const year = new Date().getFullYear();
    const count = await prisma.nCRRecord.count({ where: { ncrNumber: { startsWith: `NCR-${year}-` } } });
    const ncrNumber = `NCR-${year}-${String(count + 1).padStart(4, '0')}`;

    // title is a required field with no client-facing input for it (the
    // "Raise NCR" form only collects a free-form description) — derive a
    // short headline from the description rather than adding a redundant
    // field to a form meant for fast shop-floor reporting.
    const title = parsed.data.issueDescription.length > 100
      ? `${parsed.data.issueDescription.slice(0, 97)}...`
      : parsed.data.issueDescription;

    const ncr = await prisma.nCRRecord.create({ data: { ...parsed.data, ncrNumber, title } as any });

    // Fire alert
    await prisma.spoolAlert.create({
      data: {
        type: 'NCR_RAISED',
        severity: data.severity === 'CRITICAL' ? 'CRITICAL' : data.severity === 'MAJOR' ? 'WARNING' : 'INFO',
        title: `NCR Raised — ${ncrNumber}`,
        message: `${data.severity} non-conformance: ${(data.issueDescription ?? '').slice(0, 120)}`,
        link: '/pipe-spool/ncr',
        spoolId: data.spoolId ?? null,
        jointId: data.jointId ?? null,
        ncrId: ncr.id,
      },
    }).catch(() => { /* non-blocking */ });

    return apiSuccess({ ncr });
  } catch (e: any) {
    if (e?.code === 'P2002') return apiError('NCR number already exists', 'DUPLICATE', 409);
    return apiError('Failed to save NCR', 'NCR_SAVE_FAILED', 500);
  }
}
