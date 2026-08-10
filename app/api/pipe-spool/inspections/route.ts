import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { onFitUpInspectionPass } from '@/lib/spoolFlow';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { requireRole } from '@/lib/api-auth';
import { verifySignatureForEntity } from '@/lib/services/ElectronicSignatureService';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

// Spool must have progressed past storage/issue before inspection can be recorded
const INSPECTION_BLOCKED_STATUSES = ['FABRICATING', 'RECEIVED', 'IN_STORAGE'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

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
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'update_result' && id) {
      const guard = await requireSpoolAction('APPROVE_INSPECTION');
      if (guard instanceof NextResponse) return guard;

      const before = await prisma.spoolInspection.findUnique({ where: { id } });
      if (!before) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });

      // Quality guard: passing a joint inspection requires joint to be in NDE_PENDING.
      // FIT_UP-type inspections happen earlier in the joint lifecycle (see
      // JOINT_TRANSITIONS: PENDING → FIT_UP, well before WELDED → NDE_PENDING)
      // and are gated/advanced by onFitUpInspectionPass below instead — without
      // this exclusion, no FIT_UP inspection could ever pass, since a joint is
      // never simultaneously in its pre-weld stage and NDE_PENDING.
      if (data.result === 'PASS' && before.jointId && before.inspectionType !== 'FIT_UP') {
        const joint = await prisma.spoolJoint.findUnique({
          where: { id: before.jointId },
          select: { status: true, jointId: true },
        });
        if (joint && joint.status !== 'NDE_PENDING') {
          return NextResponse.json(
            { error: `Cannot pass inspection — joint ${joint.jointId} must be in NDE_PENDING status (currently: ${joint.status}).` },
            { status: 422 },
          );
        }
      }

      // HIGH-8 fix: recording a pass/fail inspection result requires a valid
      // electronic signature for this exact record, not just the role check.
      if (!guard.userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
      const sigCheck = await verifySignatureForEntity({
        signatureId: data.signatureId,
        userId: guard.userId,
        entityType: 'SpoolInspection',
        entityId: id,
        payload: { result: data.result, notes: data.notes ?? null, clientApproved: !!data.clientApproved },
      });
      if (!sigCheck.ok) return NextResponse.json({ error: sigCheck.error }, { status: 403 });

      const inspection = await prisma.spoolInspection.update({
        where: { id },
        data: {
          result: data.result,
          notes: data.notes,
          clientApproved: data.clientApproved,
        },
      });
      await AuditService.logChange({
        action: 'INSPECTION_UPDATE_RESULT',
        entity: 'SpoolInspection',
        entityId: inspection.id,
        before,
        after: inspection,
        userId: guard.userId,
      });
      // Flow: fit-up inspection PASS → advance joint to FIT_UP
      if (inspection.jointId && data.result === 'PASS' && inspection.inspectionType === 'FIT_UP') {
        await onFitUpInspectionPass(inspection.jointId).catch(() => {});
      }
      return NextResponse.json({ inspection });
    }

    if (id) {
      const guard = await requireSpoolAction('APPROVE_INSPECTION');
      if (guard instanceof NextResponse) return guard;
      const inspection = await prisma.spoolInspection.update({ where: { id }, data });
      return NextResponse.json({ inspection });
    }

    // RBAC: only QC+ can create inspection records
    const guard = await requireSpoolAction('CREATE_INSPECTION');
    if (guard instanceof NextResponse) return guard;

    // Status guard: spool must have progressed past storage before inspection
    if (data.spoolId) {
      const spool = await prisma.pipeSpool.findUnique({
        where: { id: data.spoolId },
        select: { status: true, spoolId: true },
      });
      if (!spool) return NextResponse.json({ error: 'Spool not found' }, { status: 404 });
      if (INSPECTION_BLOCKED_STATUSES.includes(spool.status)) {
        return NextResponse.json(
          { error: `Cannot record inspection — spool ${spool.spoolId} is in '${spool.status}' status. Spool must be issued to the floor before inspection can begin.` },
          { status: 422 },
        );
      }
    }

    // Map frontend fields → schema fields
    const payload: any = { ...data };
    if (payload.itpTemplateId) { payload.itpId = payload.itpTemplateId; delete payload.itpTemplateId; }
    if (payload.inspectorName) { payload.inspector = payload.inspectorName; delete payload.inspectorName; }
    if (payload.remarks) { payload.notes = payload.remarks; delete payload.remarks; }
    if ('holdFlag' in payload) delete payload.holdFlag; // not in schema

    const inspection = await prisma.spoolInspection.create({ data: payload });
    await AuditService.log(EventType.AUDIT_CHANGE, `Inspection record created`, { inspectionId: inspection.id, spoolId: inspection.spoolId }, guard.userId);
    return NextResponse.json({ inspection });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Duplicate inspection record' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save inspection' }, { status: 500 });
  }
}
