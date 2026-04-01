import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { canTransition, JOINT_TRANSITIONS, jointTransitionError } from '@/lib/spoolTransitions';
import { JOINT_STATUSES } from '@/lib/spoolStatus';

export async function GET(req: NextRequest) {
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

    const where: any = {};
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
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'update_status' && id) {
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

      // Fire alert if hold placed
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
        }).catch(() => { });
      }

      // Recalc parent spool status
      const { recalcSpoolStatus } = await import('@/lib/spoolFlow');
      await recalcSpoolStatus(joint.spoolId).catch(() => {});

      return NextResponse.json({ joint });
    }

    if (action === 'verify_pair') {
      // Verify two RFID tags belong to the same joint
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

    if (id) {
      const joint = await prisma.spoolJoint.update({ where: { id }, data });
      return NextResponse.json({ joint });
    }

    const joint = await prisma.spoolJoint.create({ data });
    return NextResponse.json({ joint });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Joint ID or RFID already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save joint' }, { status: 500 });
  }
}
