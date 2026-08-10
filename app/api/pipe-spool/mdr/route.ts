import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { requireRole } from '@/lib/api-auth';
import { verifySignatureForEntity } from '@/lib/services/ElectronicSignatureService';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

const VALID_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'SUBMITTED', 'CLOSED'] as const;

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const spoolId = searchParams.get('spoolId');
    const status = searchParams.get('status');

    if (id) {
      const mdr = await prisma.mDR.findUnique({
        where: { id },
        include: {
          mdrSpools: {
            include: { spool: { select: { spoolId: true, status: true } } },
          },
        },
      });
      if (!mdr) return NextResponse.json({ error: 'MDR not found' }, { status: 404 });
      return NextResponse.json({ mdr });
    }

    if (spoolId) {
      const mdrs = await prisma.mDR.findMany({
        where: { mdrSpools: { some: { spoolId } } },
        include: { mdrSpools: { select: { spoolId: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ mdrs });
    }

    const where: any = {};
    if (status) where.status = status;

    const mdrs = await prisma.mDR.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { mdrSpools: true } } },
    });
    return NextResponse.json({ mdrs });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch MDR records' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, spoolIds, ...data } = body;

    // ── add spools to MDR ────────────────────────────────────────────────────
    if (action === 'add_spools' && id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;
      if (!Array.isArray(spoolIds) || spoolIds.length === 0) {
        return NextResponse.json({ error: 'spoolIds array required' }, { status: 400 });
      }
      await prisma.mDRSpool.createMany({
        data: spoolIds.map((sid: string) => ({ mdrId: id, spoolId: sid })),
        skipDuplicates: true,
      });
      const mdr = await prisma.mDR.findUnique({
        where: { id },
        include: { mdrSpools: { include: { spool: { select: { spoolId: true } } } } },
      });
      return NextResponse.json({ mdr });
    }

    // ── remove spool from MDR ────────────────────────────────────────────────
    if (action === 'remove_spool' && id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;
      const { spoolId } = data;
      await prisma.mDRSpool.deleteMany({ where: { mdrId: id, spoolId } });
      return NextResponse.json({ ok: true });
    }

    // ── advance status ───────────────────────────────────────────────────────
    // Advancing to APPROVED/SUBMITTED is an approval act and requires
    // APPROVE_MDR (QUALITY/SUPERVISOR/ADMIN); advancing DRAFT→REVIEW is a
    // plain status move any spool role can do (CRIT-3 fix: an operator could
    // previously self-approve/submit an MDR via this branch).
    if (action === 'advance_status' && id) {
      const mdr = await prisma.mDR.findUnique({ where: { id } });
      if (!mdr) return NextResponse.json({ error: 'MDR not found' }, { status: 404 });

      const idx = VALID_STATUSES.indexOf(mdr.status as typeof VALID_STATUSES[number]);
      if (idx < 0 || idx >= VALID_STATUSES.length - 1) {
        return NextResponse.json({ error: `MDR is already at terminal status: ${mdr.status}` }, { status: 422 });
      }
      const nextStatus = VALID_STATUSES[idx + 1];
      const requiresApproval = nextStatus === 'APPROVED' || nextStatus === 'SUBMITTED';
      const guard = await requireSpoolAction(requiresApproval ? 'APPROVE_MDR' : 'UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;

      // HIGH-8 fix: the actual approval act (advancing to APPROVED) requires
      // a valid electronic signature for this exact MDR, not just the role
      // check above.
      if (nextStatus === 'APPROVED') {
        if (!guard.userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
        const sigCheck = await verifySignatureForEntity({
          signatureId: data.signatureId,
          userId: guard.userId,
          entityType: 'MDR',
          entityId: id,
          payload: { nextStatus },
        });
        if (!sigCheck.ok) return NextResponse.json({ error: sigCheck.error }, { status: 403 });
      }

      const updateData: any = { status: nextStatus };
      if (nextStatus === 'REVIEW') updateData.preparedAt = new Date();
      if (nextStatus === 'APPROVED') { updateData.reviewedAt = new Date(); updateData.reviewedBy = guard.username; }
      if (nextStatus === 'SUBMITTED') { updateData.approvedAt = new Date(); updateData.approvedBy = guard.username; updateData.submittedAt = new Date(); }

      const updated = await prisma.mDR.update({ where: { id }, data: updateData });
      return NextResponse.json({ mdr: updated });
    }

    // ── update existing MDR (non-status field patch) ─────────────────────────
    if (id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;
      const { status: _status, approvedAt: _approvedAt, approvedBy: _approvedBy, reviewedAt: _reviewedAt, reviewedBy: _reviewedBy, submittedAt: _submittedAt, ...safeData } = data;
      const mdr = await prisma.mDR.update({ where: { id }, data: safeData });
      return NextResponse.json({ mdr });
    }

    // ── create new MDR ───────────────────────────────────────────────────────
    const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
    if (guard instanceof NextResponse) return guard;

    if (!data.mdrNumber) return NextResponse.json({ error: 'mdrNumber is required' }, { status: 400 });

    const mdr = await prisma.mDR.create({
      data: { ...data, preparedBy: data.preparedBy ?? guard.username },
    });

    if (Array.isArray(spoolIds) && spoolIds.length > 0) {
      await prisma.mDRSpool.createMany({
        data: spoolIds.map((sid: string) => ({ mdrId: mdr.id, spoolId: sid })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ mdr }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'MDR number already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save MDR' }, { status: 500 });
  }
}
