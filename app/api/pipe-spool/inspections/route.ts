import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { onFitUpInspectionPass } from '@/lib/spoolFlow';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const spoolId = searchParams.get('spoolId');
    const jointId = searchParams.get('jointId');
    const result = searchParams.get('result');

    if (id) {
      const inspection = await prisma.spoolInspection.findUnique({
        where: { id },
        include: {
          spool: { select: { spoolId: true } },
          joint: { select: { jointId: true } },
          itp: { select: { name: true } },
          itpStep: { select: { description: true, checkType: true, sequence: true } },
          approvals: true,
          documents: true,
        },
      });
      if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ inspection });
    }

    const where: any = {};
    if (spoolId) where.spoolId = spoolId;
    if (jointId) where.jointId = jointId;
    if (result) where.result = result;

    const inspections = await prisma.spoolInspection.findMany({
      where,
      orderBy: { inspectedAt: 'desc' },
      include: {
        spool: { select: { spoolId: true } },
        joint: { select: { jointId: true } },
        itp: { select: { name: true } },
        itpStep: { select: { description: true, checkType: true, sequence: true } },
      },
    });
    return NextResponse.json({ inspections });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch inspections' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'update_result' && id) {
      const inspection = await prisma.spoolInspection.update({
        where: { id },
        data: {
          result: data.result,
          notes: data.notes,
          clientApproved: data.clientApproved,
        },
      });
      // Flow: fit-up inspection PASS → advance joint to FIT_UP
      if (inspection.jointId && data.result === 'PASS') {
        await onFitUpInspectionPass(inspection.jointId).catch(() => {});
      }
      return NextResponse.json({ inspection });
    }

    if (id) {
      const inspection = await prisma.spoolInspection.update({ where: { id }, data });
      return NextResponse.json({ inspection });
    }

    // Map frontend fields → schema fields
    const payload: any = { ...data };
    if (payload.itpTemplateId) { payload.itpId = payload.itpTemplateId; delete payload.itpTemplateId; }
    if (payload.inspectorName) { payload.inspector = payload.inspectorName; delete payload.inspectorName; }
    if (payload.remarks) { payload.notes = payload.remarks; delete payload.remarks; }
    if ('holdFlag' in payload) delete payload.holdFlag; // not in schema

    const inspection = await prisma.spoolInspection.create({ data: payload });
    return NextResponse.json({ inspection });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Duplicate inspection record' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save inspection' }, { status: 500 });
  }
}
