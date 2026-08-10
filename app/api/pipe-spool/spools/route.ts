import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { canTransition, SPOOL_TRANSITIONS, spoolTransitionError } from '@/lib/spoolTransitions';
import { SPOOL_STATUSES } from '@/lib/spoolStatus';
import { CreateSpoolSchema, UpdateSpoolStatusSchema, validationError } from '@/lib/validation';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { fkSpoolLine, fkWorkOrder } from '@/lib/fkValidation';
import { recordStatusChange } from '@/lib/services/StatusHistoryService';
import { appendChain } from '@/lib/services/AuditChainService';
import { requireRole } from '@/lib/api-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('pipe-spool.spools');
const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const lineId = searchParams.get('lineId');
    const rfid = searchParams.get('rfid');
    const barcode = searchParams.get('barcode');
    const status = searchParams.get('status');

    if (rfid) {
      const spool = await prisma.pipeSpool.findFirst({
        where: { OR: [{ rfidTag1: rfid }, { rfidTag2: rfid }] },
        include: { line: true, drawing: true, joints: true },
      });
      if (!spool) return apiError('Spool not found for RFID', 'SPOOL_NOT_FOUND', 404);
      return apiSuccess({ spool });
    }
    if (barcode) {
      const spool = await prisma.pipeSpool.findFirst({
        where: { barcode },
        include: { line: true, drawing: true, joints: true },
      });
      if (!spool) return apiError('Spool not found for barcode', 'SPOOL_NOT_FOUND', 404);
      return apiSuccess({ spool });
    }

    if (id) {
      const spool = await prisma.pipeSpool.findUnique({
        where: { id },
        include: {
          line: true,
          drawing: true,
          joints: {
            include: {
              weldRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
              ndeRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
              ncrs: { where: { status: { not: 'CLOSED' } } },
            },
          },
          inspections: { orderBy: { inspectedAt: 'desc' }, take: 10 },
          pressureTests: { orderBy: { createdAt: 'desc' }, take: 5 },
          ncrs: { where: { status: { not: 'CLOSED' } } },
          documents: { orderBy: { uploadedAt: 'desc' } },
          approvals: { orderBy: { approvedAt: 'desc' } },
        },
      });
      if (!spool) return apiError('Not found', 'SPOOL_NOT_FOUND', 404);
      return apiSuccess({ spool });
    }

    const where: any = { deletedAt: null };
    if (lineId) where.lineId = lineId;
    if (status) where.status = status;

    const spools = await prisma.pipeSpool.findMany({
      where,
      orderBy: { spoolId: 'asc' },
      include: {
        line: { select: { lineNumber: true, area: true } },
        _count: { select: { joints: true, ncrs: true } },
      },
    });
    return apiSuccess({ spools });
  } catch (e) {
    return apiError('Failed to fetch spools', 'SPOOL_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    // ── update_status ────────────────────────────────────────────────────────
    if (action === 'update_status' && id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;

      const parsed = UpdateSpoolStatusSchema.safeParse({ action, id, ...data });
      if (!parsed.success) return validationError(parsed.error);
      const payload = parsed.data;

      const current = await prisma.pipeSpool.findUnique({ where: { id }, select: { status: true } });
      if (!current) return apiError('Spool not found', 'SPOOL_NOT_FOUND', 404);
      if (!SPOOL_STATUSES.includes(payload.status)) {
        return apiError(`Invalid status: ${payload.status}`, 'INVALID_STATUS', 400);
      }
      if (!canTransition(SPOOL_TRANSITIONS, current.status, payload.status)) {
        return apiError(spoolTransitionError(current.status, payload.status), 'FLOW_ERROR', 422);
      }

      const spool = await prisma.pipeSpool.update({
        where: { id },
        data: { status: payload.status, notes: payload.notes },
      });

      await recordStatusChange('PipeSpool', id, current.status, payload.status, {
        changedBy: guard.username ?? 'operator',
        changedByUserId: guard.userId,
        changedByRole: guard.role,
      }, payload.notes).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });

      return apiSuccess({ spool });
    }

    // ── assign_storage ───────────────────────────────────────────────────────
    if (action === 'assign_storage' && id) {
      const guard = await requireSpoolAction('ASSIGN_YARD');
      if (guard instanceof NextResponse) return guard;

      const cur = await prisma.pipeSpool.findUnique({ where: { id }, select: { status: true } });
      if (!cur) return apiError('Spool not found', 'SPOOL_NOT_FOUND', 404);
      if (!canTransition(SPOOL_TRANSITIONS, cur.status, 'IN_STORAGE')) {
        return apiError(spoolTransitionError(cur.status, 'IN_STORAGE'), 'FLOW_ERROR', 422);
      }

      const spool = await prisma.pipeSpool.update({
        where: { id },
        data: {
          storageZone: data.zone,
          storageRack: data.rack,
          storageRow: data.row,
          storagePosition: data.position,
          status: 'IN_STORAGE',
          receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
          receivedBy: data.receivedBy,
        },
      });

      await recordStatusChange('PipeSpool', id, cur.status, 'IN_STORAGE', {
        changedBy: guard.username ?? 'operator',
        changedByUserId: guard.userId,
        changedByRole: guard.role,
      }, `Assigned to zone ${data.zone ?? 'N/A'}`).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });

      return apiSuccess({ spool });
    }

    // ── issue ────────────────────────────────────────────────────────────────
    if (action === 'issue' && id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;

      const cur = await prisma.pipeSpool.findUnique({ where: { id }, select: { status: true } });
      if (!cur) return apiError('Spool not found', 'SPOOL_NOT_FOUND', 404);
      if (!canTransition(SPOOL_TRANSITIONS, cur.status, 'ISSUED')) {
        return apiError(spoolTransitionError(cur.status, 'ISSUED'), 'FLOW_ERROR', 422);
      }

      const spool = await prisma.pipeSpool.update({
        where: { id },
        data: { status: 'ISSUED', issuedAt: new Date(), issuedTo: data.issuedTo },
      });

      await recordStatusChange('PipeSpool', id, cur.status, 'ISSUED', {
        changedBy: guard.username ?? 'operator',
        changedByUserId: guard.userId,
        changedByRole: guard.role,
      }, data.issuedTo ? `Issued to: ${data.issuedTo}` : undefined).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });

      return apiSuccess({ spool });
    }

    // ── soft_delete ──────────────────────────────────────────────────────────
    if (action === 'soft_delete' && id) {
      const guard = await requireSpoolAction('SOFT_DELETE');
      if (guard instanceof NextResponse) return guard;

      const target = await prisma.pipeSpool.findUnique({ where: { id }, select: { spoolId: true, deletedAt: true } });
      if (!target) return apiError('Spool not found', 'SPOOL_NOT_FOUND', 404);
      if (target.deletedAt) return apiError('Spool is already deleted', 'ALREADY_DELETED', 409);

      const spool = await prisma.pipeSpool.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: guard.username ?? 'operator' },
      });

      await appendChain({
        entityType: 'PipeSpool', entityId: id, action: 'SOFT_DELETE',
        userId: guard.userId,
        payload: { spoolId: target.spoolId, deletedBy: guard.username, reason: data.reason ?? null },
      }).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });

      return apiSuccess({ spool });
    }

    // ── bare id update (non-status field patch) ──────────────────────────────
    // Bug 3 fix: strip `status` to prevent bypassing the state machine.
    // Status changes must go through the update_status / assign_storage / issue actions above.
    if (id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;
      const { status: _dropped, ...safeData } = data;
      const spool = await prisma.pipeSpool.update({ where: { id }, data: safeData });
      return apiSuccess({ spool });
    }

    // ── create ───────────────────────────────────────────────────────────────
    const guard = await requireSpoolAction('CREATE_SPOOL');
    if (guard instanceof NextResponse) return guard;

    const createParsed = CreateSpoolSchema.safeParse(data);
    if (!createParsed.success) return validationError(createParsed.error);

    // FK validation
    const lineErr = await fkSpoolLine(createParsed.data.lineId);
    if (lineErr) return apiError(lineErr, 'FK_INVALID', 422);

    if (createParsed.data.workOrderId) {
      const woErr = await fkWorkOrder(createParsed.data.workOrderId);
      if (woErr) return apiError(woErr, 'FK_INVALID', 422);
    }

    const spool = await prisma.pipeSpool.create({ data: createParsed.data });
    return apiSuccess({ spool }, 201);
  } catch (e: any) {
    if (e?.code === 'P2002') return apiError('Spool ID / RFID already exists', 'DUPLICATE', 409);
    return apiError('Failed to save spool', 'SPOOL_SAVE_FAILED', 500);
  }
}
