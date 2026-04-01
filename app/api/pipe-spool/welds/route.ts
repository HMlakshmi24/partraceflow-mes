import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { onWeldCreated } from '@/lib/spoolFlow';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { CreateWeldSchema, validationError } from '@/lib/validation';
import { revisionError } from '@/lib/revisionGuard';

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

    // Revision guard: check drawing status before recording weld
    if (data.jointId) {
      const joint = await prisma.spoolJoint.findUnique({ where: { id: data.jointId }, select: { spoolId: true } });
      if (joint?.spoolId) {
        const revErr = await revisionError(joint.spoolId, 'WELD', isSupervisor);
        if (revErr) return NextResponse.json(revErr.body, { status: revErr.status });
      }
    }

    const record = await prisma.weldRecord.create({ data });
    if (record.jointId) await onWeldCreated(record.jointId).catch(() => {});
    return NextResponse.json({ record });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to save weld record' }, { status: 500 });
  }
}
