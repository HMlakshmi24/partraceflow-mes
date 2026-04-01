/**
 * Pipe Spool Flow Engine
 *
 * Enforces the state-machine transitions from the process flow diagram:
 * FABRICATING → RECEIVED → IN_STORAGE → ISSUED → FIT_UP → WELDED
 *   → NDE_PENDING → NDE_CLEAR → PRESSURE_TESTED → COMPLETE
 *
 * Joints follow their own sub-flow that feeds into the spool flow.
 */

import { prisma } from '@/lib/services/database';
import { SPOOL_TRANSITIONS, canTransition } from '@/lib/spoolTransitions';

// ── Spool auto-advance logic ──────────────────────────────────────────────────
// Called after a joint status changes to see if the parent spool should advance.

export async function recalcSpoolStatus(spoolId: string): Promise<void> {
  const spool = await prisma.pipeSpool.findUnique({
    where: { id: spoolId },
    include: { joints: { select: { status: true, ndeRequired: true } } },
  });
  if (!spool || spool.joints.length === 0) return;

  const statuses = spool.joints.map(j => j.status);
  const current = spool.status;

  let next: string | null = null;

  const allMatch = (...allowed: string[]) =>
    statuses.every(s => allowed.includes(s));

  if (allMatch('COMPLETE') && current !== 'COMPLETE') {
    next = 'COMPLETE';
  } else if (allMatch('NDE_CLEAR', 'COMPLETE') && !['PRESSURE_TESTED', 'COMPLETE'].includes(current)) {
    next = 'NDE_CLEAR';
  } else if (allMatch('NDE_PENDING', 'NDE_CLEAR', 'REPAIR', 'COMPLETE') && !['NDE_CLEAR', 'PRESSURE_TESTED', 'COMPLETE'].includes(current)) {
    next = 'NDE_PENDING';
  } else if (allMatch('WELDED', 'NDE_PENDING', 'NDE_CLEAR', 'REPAIR', 'COMPLETE') && !['NDE_PENDING', 'NDE_CLEAR', 'PRESSURE_TESTED', 'COMPLETE'].includes(current)) {
    next = 'WELDED';
  } else if (statuses.some(s => ['FIT_UP', 'WELDED', 'NDE_PENDING', 'NDE_CLEAR', 'REPAIR', 'COMPLETE'].includes(s))
    && !['FIT_UP', 'WELDED', 'NDE_PENDING', 'NDE_CLEAR', 'PRESSURE_TESTED', 'COMPLETE', 'HOLD'].includes(current)) {
    next = 'FIT_UP';
  }

  if (next && canTransition(SPOOL_TRANSITIONS, current, next)) {
    await prisma.pipeSpool.update({ where: { id: spoolId }, data: { status: next } });
  }
}

// ── Event handlers called from API routes ─────────────────────────────────────

/** Call after creating a weld record. Advances joint to WELDED and triggers spool recalc. */
export async function onWeldCreated(jointId: string): Promise<void> {
  const joint = await prisma.spoolJoint.findUnique({ where: { id: jointId } });
  if (!joint) return;

  const advanceable = ['PENDING', 'FIT_UP'];
  if (advanceable.includes(joint.status)) {
    await prisma.spoolJoint.update({ where: { id: jointId }, data: { status: 'WELDED' } });
  }
  await recalcSpoolStatus(joint.spoolId);
}

/** Call after NDE result is saved. Advances joint status and fires alerts. */
export async function onNDEResult(
  jointId: string,
  result: string,         // ACCEPTABLE | REJECTABLE
  holdFlag: boolean,
  ndeRecordId: string,
): Promise<void> {
  const joint = await prisma.spoolJoint.findUnique({ where: { id: jointId } });
  if (!joint) return;

  if (result === 'ACCEPTABLE' && !holdFlag) {
    await prisma.spoolJoint.update({
      where: { id: jointId },
      data: { status: 'NDE_CLEAR', holdFlag: false },
    });
  } else if (result === 'REJECTABLE') {
    await prisma.spoolJoint.update({
      where: { id: jointId },
      data: { status: 'REPAIR', holdFlag: true },
    });
    await prisma.spoolAlert.create({
      data: {
        type: 'HOLD_PLACED',
        severity: 'WARNING',
        title: `NDE Rejection — Joint ${joint.jointId}`,
        message: `NDE result REJECTABLE on joint ${joint.jointId} — repair required`,
        link: '/pipe-spool/nde',
        jointId: joint.id,
        ncrId: null,
      },
    }).catch(() => {});
  } else if (holdFlag) {
    await prisma.spoolJoint.update({
      where: { id: jointId },
      data: { status: 'NDE_PENDING', holdFlag: true },
    });
    await prisma.spoolAlert.create({
      data: {
        type: 'NDE_HOLD',
        severity: 'WARNING',
        title: `NDE Hold — Joint ${joint.jointId}`,
        message: `NDE hold placed on joint ${joint.jointId} — pending review`,
        link: '/pipe-spool/nde',
        jointId: joint.id,
        ncrId: null,
      },
    }).catch(() => {});
  }

  await recalcSpoolStatus(joint.spoolId);
}

/** Call after pressure test result is saved. Advances spool status. */
export async function onPressureTestResult(spoolId: string, result: string): Promise<void> {
  const spool = await prisma.pipeSpool.findUnique({ where: { id: spoolId } });
  if (!spool) return;

  if (result === 'PASS') {
    const target = canTransition(SPOOL_TRANSITIONS, spool.status, 'PRESSURE_TESTED')
      ? 'PRESSURE_TESTED'
      : canTransition(SPOOL_TRANSITIONS, spool.status, 'COMPLETE')
        ? 'COMPLETE'
        : null;
    if (target) {
      await prisma.pipeSpool.update({ where: { id: spoolId }, data: { status: target } });
      await prisma.spoolAlert.create({
        data: {
          type: 'INSPECTION_FAILED',   // reuse type — pressure test PASS
          severity: 'INFO',
          title: `Pressure Test PASSED — ${spool.spoolId}`,
          message: `Spool ${spool.spoolId} pressure test passed → status: ${target}`,
          link: '/pipe-spool/pressure-tests',
          spoolId: spool.id,
          ncrId: null,
        },
      }).catch(() => {});
    }
  } else if (result === 'FAIL') {
    await prisma.spoolAlert.create({
      data: {
        type: 'INSPECTION_FAILED',
        severity: 'CRITICAL',
        title: `Pressure Test FAILED — ${spool.spoolId}`,
        message: `Spool ${spool.spoolId} pressure test failed — re-test required`,
        link: '/pipe-spool/pressure-tests',
        spoolId: spool.id,
        ncrId: null,
      },
    }).catch(() => {});
  }
}

/** Call after a fit-up inspection passes. Advances joint to FIT_UP. */
export async function onFitUpInspectionPass(jointId: string): Promise<void> {
  const joint = await prisma.spoolJoint.findUnique({ where: { id: jointId } });
  if (!joint) return;
  if (joint.status === 'PENDING') {
    await prisma.spoolJoint.update({ where: { id: jointId }, data: { status: 'FIT_UP' } });
    await recalcSpoolStatus(joint.spoolId);
  }
}
