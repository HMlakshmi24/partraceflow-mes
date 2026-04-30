import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { onWeldCreated } from '@/lib/spoolFlow';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { CreateWeldSchema, validationError } from '@/lib/validation';
import { revisionError } from '@/lib/revisionGuard';
import { AuditService, EventType } from '@/lib/services/AuditService';

// Joint must be in one of these statuses before a weld record can be created
const WELD_ALLOWED_JOINT_STATUSES = ['FIT_UP', 'PENDING'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const jointId = searchParams.get('jointId');
    const welderId = searchParams.get('welderId');
    const status = searchParams.get('status');

    if (id) {
      const record = await prisma.weldRecord.findUnique({
        where: { id },
        include: {
          joint: { include: { spool: { select: { spoolId: true } } } },
          documents: true,
        },
      });
      if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ record });
    }

    const where: any = {};
    if (jointId) where.jointId = jointId;
    if (welderId) where.welderId = welderId;
    if (status) where.status = status;

    const records = await prisma.weldRecord.findMany({
      where,
      orderBy: { weldDate: 'desc' },
      include: {
        joint: { select: { jointId: true, spoolId: true, jointType: true } },
      },
    });
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch weld records' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'update_status' && id) {
      const guard = await requireSpoolAction('UPDATE_WELD');
      if (guard instanceof NextResponse) return guard;
      const record = await prisma.weldRecord.update({
        where: { id },
        data: { status: data.status, repairCount: data.repairCount },
      });
      return NextResponse.json({ record });
    }

    if (id) {
      const record = await prisma.weldRecord.update({ where: { id }, data });
      return NextResponse.json({ record });
    }

    // RBAC: only OPERATOR+ can create weld records
    const guard = await requireSpoolAction('CREATE_WELD');
    if (guard instanceof NextResponse) return guard;
    const isSupervisor = guard.role === 'SUPERVISOR' || guard.role === 'ADMIN';

    // Validate payload
    const parsed = CreateWeldSchema.safeParse(data);
    if (!parsed.success) return validationError(parsed.error);

    // Status guard: joint must be in FIT_UP before welding can be recorded
    if (data.jointId) {
      const joint = await prisma.spoolJoint.findUnique({
        where: { id: data.jointId },
        select: { spoolId: true, status: true, jointId: true },
      });
      if (!joint) return NextResponse.json({ error: 'Joint not found' }, { status: 404 });
      if (!WELD_ALLOWED_JOINT_STATUSES.includes(joint.status)) {
        return NextResponse.json(
          { error: `Cannot record weld — joint ${joint.jointId} is in '${joint.status}' status. Joint must be in FIT_UP before welding.` },
          { status: 422 },
        );
      }
      // Revision guard: check drawing status before recording weld
      if (joint.spoolId) {
        const revErr = await revisionError(joint.spoolId, 'WELD', isSupervisor);
        if (revErr) return NextResponse.json(revErr.body, { status: revErr.status });
      }
    }

    const record = await prisma.weldRecord.create({ data });
    await AuditService.log(EventType.AUDIT_CHANGE, `Weld record created for joint`, { weldId: record.id, jointId: record.jointId }, guard.userId);
    if (record.jointId) await onWeldCreated(record.jointId).catch(() => {});
    return NextResponse.json({ record });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to save weld record' }, { status: 500 });
  }
}
