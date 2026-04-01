import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { canTransition, SPOOL_TRANSITIONS, spoolTransitionError } from '@/lib/spoolTransitions';
import { SPOOL_STATUSES } from '@/lib/spoolStatus';
import { CreateSpoolSchema, UpdateSpoolStatusSchema, validationError } from '@/lib/validation';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { apiError, apiSuccess } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const lineId = searchParams.get('lineId');
    const rfid = searchParams.get('rfid');
    const barcode = searchParams.get('barcode');
    const status = searchParams.get('status');

    // RFID / barcode lookup (field scan)
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
          joints: { include: { _count: { select: { ndeRecords: true, weldRecords: true } } } },
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

    const where: any = {};
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
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

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
      return apiSuccess({ spool });
    }

    if (action === 'assign_storage' && id) {
      const guard = await requireSpoolAction('ASSIGN_YARD');
      if (guard instanceof NextResponse) return guard;
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
      return apiSuccess({ spool });
    }

    if (action === 'issue' && id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;
      const spool = await prisma.pipeSpool.update({
        where: { id },
        data: { status: 'ISSUED', issuedAt: new Date(), issuedTo: data.issuedTo },
      });
      return apiSuccess({ spool });
    }

    if (id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;
      const spool = await prisma.pipeSpool.update({ where: { id }, data });
      return apiSuccess({ spool });
    }

    const guard = await requireSpoolAction('CREATE_SPOOL');
    if (guard instanceof NextResponse) return guard;
    const createParsed = CreateSpoolSchema.safeParse(data);
    if (!createParsed.success) return validationError(createParsed.error);

    const spool = await prisma.pipeSpool.create({ data: createParsed.data });
    return apiSuccess({ spool });
  } catch (e: any) {
    if (e?.code === 'P2002') return apiError('Spool ID / RFID already exists', 'DUPLICATE', 409);
    return apiError('Failed to save spool', 'SPOOL_SAVE_FAILED', 500);
  }
}
