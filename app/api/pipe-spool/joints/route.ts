import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { canTransition, JOINT_TRANSITIONS, jointTransitionError } from '@/lib/spoolTransitions';
import { JOINT_STATUSES } from '@/lib/spoolStatus';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { CreateJointSchema, validationError } from '@/lib/validation';
import { fkSpool } from '@/lib/fkValidation';
import { recordStatusChange } from '@/lib/services/StatusHistoryService';
import { appendChain } from '@/lib/services/AuditChainService';
import { requireRole } from '@/lib/api-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('pipe-spool.joints');
const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const spoolId = searchParams.get('spoolId');
    const rfid = searchParams.get('rfid');
    const status = searchParams.get('status');

    if (rfid) {
      const joint = await prisma.spoolJoint.findFirst({
        where: { OR: [{ rfidTag1: rfid }, { rfidTag2: rfid }] },
        include: { spool: { include: { line: true } }, weldRecords: true, ndeRecords: true },
      });
      if (!joint) return NextResponse.json({ error: 'Joint not found for RFID' }, { status: 404 });
      return NextResponse.json({ joint });
    }

    if (id) {
      const joint = await prisma.spoolJoint.findUnique({
        where: { id },
        include: {
          spool: { include: { line: true } },
          inspections: { orderBy: { inspectedAt: 'desc' } },
          weldRecords: { orderBy: { createdAt: 'desc' } },
          ndeRecords: { orderBy: { createdAt: 'desc' } },
          documents: { orderBy: { uploadedAt: 'desc' } },
          approvals: { orderBy: { approvedAt: 'desc' } },
          ncrs: true,
        },
      });
      if (!joint) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ joint });
    }

    const where: any = { deletedAt: null };
    if (spoolId) where.spoolId = spoolId;
    if (status) where.status = status;

    const joints = await prisma.spoolJoint.findMany({
      where,
      orderBy: { jointId: 'asc' },
      include: {
        spool: { select: { spoolId: true } },
        _count: { select: { weldRecords: true, ndeRecords: true, ncrs: true } },
      },
    });
    return NextResponse.json({ joints });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch joints' }, { status: 500 });
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
      const guard = await requireSpoolAction('UPDATE_JOINT_STATUS');
      if (guard instanceof NextResponse) return guard;

      const current = await prisma.spoolJoint.findUnique({ where: { id }, select: { status: true } });
      if (!current) return NextResponse.json({ error: 'Joint not found' }, { status: 404 });

      if (!JOINT_STATUSES.includes(data.status)) {
        return NextResponse.json({ error: `Invalid status: ${data.status}` }, { status: 400 });
      }
      if (!canTransition(JOINT_TRANSITIONS, current.status, data.status)) {
        return NextResponse.json({ error: jointTransitionError(current.status, data.status) }, { status: 422 });
      }

      const joint = await prisma.spoolJoint.update({
        where: { id },
        data: { status: data.status, holdFlag: data.holdFlag ?? false, holdReason: data.holdReason },
      });

      await recordStatusChange('SpoolJoint', id, current.status, data.status, {
        changedBy: guard.username ?? 'operator',
        changedByUserId: guard.userId,
        changedByRole: guard.role,
      }, data.holdReason).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });

      if (data.holdFlag) {
        await prisma.spoolAlert.create({
          data: {
            type: 'HOLD_PLACED',
            severity: 'WARNING',
            title: `Hold Placed — Joint ${joint.jointId}`,
            message: data.holdReason ?? 'Hold placed on joint — QC review required',
            link: `/pipe-spool/joints?spoolId=${joint.spoolId}`,
            jointId: joint.id,
          },
        }).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });
      }

      const { recalcSpoolStatus } = await import('@/lib/spoolFlow');
      await recalcSpoolStatus(joint.spoolId).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });

      return NextResponse.json({ joint });
    }

    // ── verify_pair ──────────────────────────────────────────────────────────
    if (action === 'verify_pair') {
      const { rfid1, rfid2 } = data;
      const joint = await prisma.spoolJoint.findFirst({
        where: {
          AND: [
            { OR: [{ rfidTag1: rfid1 }, { rfidTag2: rfid1 }] },
            { OR: [{ rfidTag1: rfid2 }, { rfidTag2: rfid2 }] },
          ],
        },
        include: { spool: { include: { line: true } } },
      });
      return NextResponse.json({ verified: !!joint, joint });
    }

    // ── soft_delete ──────────────────────────────────────────────────────────
    if (action === 'soft_delete' && id) {
      const guard = await requireSpoolAction('SOFT_DELETE');
      if (guard instanceof NextResponse) return guard;

      const target = await prisma.spoolJoint.findUnique({ where: { id }, select: { jointId: true, deletedAt: true } });
      if (!target) return NextResponse.json({ error: 'Joint not found' }, { status: 404 });
      if (target.deletedAt) return NextResponse.json({ error: 'Joint is already deleted' }, { status: 409 });

      const joint = await prisma.spoolJoint.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: guard.username ?? 'operator' },
      });

      await appendChain({
        entityType: 'SpoolJoint', entityId: id, action: 'SOFT_DELETE',
        userId: guard.userId,
        payload: { jointId: target.jointId, deletedBy: guard.username, reason: data.reason ?? null },
      }).catch((e) => { log.warn('audit/status-history write failed', { message: e instanceof Error ? e.message : String(e) }); });

      return NextResponse.json({ joint });
    }

    // ── bare id patch (non-status fields) ────────────────────────────────────
    // Bug 3 fix: strip `status` to prevent bypassing the state machine.
    // Status changes must go through the update_status action above.
    if (id) {
      const guard = await requireSpoolAction('UPDATE_JOINT_STATUS');
      if (guard instanceof NextResponse) return guard;
      const { status: _dropped, ...safeData } = data;
      const joint = await prisma.spoolJoint.update({ where: { id }, data: safeData });
      return NextResponse.json({ joint });
    }

    // ── create ───────────────────────────────────────────────────────────────
    const guard = await requireSpoolAction('CREATE_SPOOL');
    if (guard instanceof NextResponse) return guard;

    const parsed = CreateJointSchema.safeParse(data);
    if (!parsed.success) return validationError(parsed.error);

    // FK validation: spool must exist
    const spoolErr = await fkSpool(parsed.data.spoolId);
    if (spoolErr) return NextResponse.json({ error: spoolErr, code: 'FK_INVALID' }, { status: 422 });

    const joint = await prisma.spoolJoint.create({ data: parsed.data });
    return NextResponse.json({ joint }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Joint ID or RFID already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save joint' }, { status: 500 });
  }
}
