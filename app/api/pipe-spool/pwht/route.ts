import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { canTransition, SPOOL_TRANSITIONS } from '@/lib/spoolTransitions';
import { onPWHTComplete } from '@/lib/spoolFlow';
import { requireRole } from '@/lib/api-auth';
import { verifySignatureForEntity } from '@/lib/services/ElectronicSignatureService';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const spoolId = searchParams.get('spoolId');

    if (id) {
      const cycle = await prisma.pWHTCycle.findUnique({
        where: { id },
        include: { spool: { select: { spoolId: true, status: true } } },
      });
      if (!cycle) return NextResponse.json({ error: 'PWHT cycle not found' }, { status: 404 });
      return NextResponse.json({ cycle });
    }

    const where: any = {};
    if (spoolId) where.spoolId = spoolId;

    const cycles = await prisma.pWHTCycle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { spool: { select: { spoolId: true } } },
    });
    return NextResponse.json({ cycles });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch PWHT cycles' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    // ── approve (mark PWHT cycle complete and advance spool) ─────────────────
    // Requires APPROVE_PWHT (QUALITY/SUPERVISOR/ADMIN) — not the broader
    // UPDATE_SPOOL_STATUS, which also includes OPERATOR (CRIT-3 fix: an
    // operator could previously self-approve a PWHT cycle via this branch).
    if (action === 'approve' && id) {
      const guard = await requireSpoolAction('APPROVE_PWHT');
      if (guard instanceof NextResponse) return guard;

      const cycle = await prisma.pWHTCycle.findUnique({
        where: { id },
        include: { spool: true },
      });
      if (!cycle) return NextResponse.json({ error: 'PWHT cycle not found' }, { status: 404 });

      // HIGH-8 fix: PWHT approval requires a valid electronic signature
      // (obtained via POST /api/auth/verify-signature) for this exact
      // record, not just the coarser role check above. Fail closed if the
      // guard somehow didn't resolve a userId.
      if (!guard.userId) {
        return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
      }
      const sigCheck = await verifySignatureForEntity({
        signatureId: data.signatureId,
        userId: guard.userId,
        entityType: 'PWHTCycle',
        entityId: id,
        payload: { result: 'PASS', approved: true },
      });
      if (!sigCheck.ok) {
        return NextResponse.json({ error: sigCheck.error }, { status: 403 });
      }

      const updated = await prisma.pWHTCycle.update({
        where: { id },
        data: {
          result: 'PASS',
          approved: true,
          approvedBy: guard.username ?? 'operator',
          approvedAt: new Date(),
        },
      });

      await onPWHTComplete(cycle.spoolId).catch(() => {});

      return NextResponse.json({ cycle: updated });
    }

    // ── update existing cycle (non-approval fields only) ─────────────────────
    if (id) {
      const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
      if (guard instanceof NextResponse) return guard;
      const { result: _result, approved: _approved, approvedBy: _approvedBy, approvedAt: _approvedAt, ...safeData } = data;
      const cycle = await prisma.pWHTCycle.update({ where: { id }, data: safeData });
      return NextResponse.json({ cycle });
    }

    // ── create new cycle (also transitions spool to PWHT) ────────────────────
    const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
    if (guard instanceof NextResponse) return guard;

    if (!data.spoolId) return NextResponse.json({ error: 'spoolId is required' }, { status: 400 });

    const spool = await prisma.pipeSpool.findUnique({ where: { id: data.spoolId } });
    if (!spool) return NextResponse.json({ error: 'Spool not found', code: 'FK_INVALID' }, { status: 422 });

    if (!canTransition(SPOOL_TRANSITIONS, spool.status, 'PWHT')) {
      return NextResponse.json({
        error: `Cannot initiate PWHT from spool status ${spool.status}`,
        code: 'FLOW_ERROR',
      }, { status: 422 });
    }

    const [cycle] = await prisma.$transaction([
      prisma.pWHTCycle.create({ data }),
      prisma.pipeSpool.update({ where: { id: data.spoolId }, data: { status: 'PWHT' } }),
    ]);

    return NextResponse.json({ cycle }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to save PWHT cycle' }, { status: 500 });
  }
}
