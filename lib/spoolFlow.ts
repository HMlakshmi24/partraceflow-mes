/**
 * Pipe Spool Flow Engine
 *
 * FABRICATING → RECEIVED → IN_STORAGE → ISSUED → FIT_UP → WELDED
 *   → [PWHT] → NDE_PENDING → NDE_CLEAR → PRESSURE_TESTED
 *   → COATING → MARKING → COMPLETE
 *
 * PWHT, COATING, and MARKING are spool-level manual gates — they are NOT
 * auto-advanced by joint status recalculation. Use the dedicated event
 * handlers (onPWHTComplete, onCoatingComplete, onMarkingComplete) instead.
 *
 * Joints follow their own sub-flow that feeds into the spool flow.
 * Every auto-advance writes a status history entry via StatusHistoryService.
 *
 * HIGH-3 fix: every status write below is a conditional `updateMany` scoped
 * to the status it was validated against (read earlier in the same
 * function), not a bare `update`. If another writer already changed the
 * status in between, `count` is 0 and the write is skipped with a warning
 * instead of silently clobbering a concurrent transition — this is a
 * compliance-critical flow (weld/NDE/pressure-test/PWHT gating) where a lost
 * update could make a non-conforming spool appear to have passed a gate.
 */

import { prisma } from '@/lib/services/database';
import { SPOOL_TRANSITIONS, canTransition } from '@/lib/spoolTransitions';
import { recordStatusChange, SYSTEM_ACTOR } from '@/lib/services/StatusHistoryService';
import { createLogger } from '@/lib/logger';

const log = createLogger('spoolFlow');

// ── Spool auto-advance ────────────────────────────────────────────────────────

export async function recalcSpoolStatus(spoolId: string): Promise<void> {
  const spool = await prisma.pipeSpool.findUnique({
    where: { id: spoolId },
    include: { joints: { select: { status: true, ndeRequired: true } } },
  });
  if (!spool || spool.joints.length === 0) return;

  const statuses: string[] = spool.joints.map((j: { status: string }) => j.status);
  const current = spool.status;

  let next: string | null = null;

  // PWHT, COATING, MARKING are manual gates — never auto-skipped by joint recalc.
  const MANUAL_GATES = ['PWHT', 'COATING', 'MARKING', 'PRESSURE_TESTED'];

  const allMatch = (...allowed: string[]) =>
    statuses.every((s: string) => allowed.includes(s));

  if (MANUAL_GATES.includes(current)) {
    // Spool is parked at a manual gate; joint recalc cannot advance it further.
    next = null;
  } else if (allMatch('COMPLETE') && current !== 'COMPLETE') {
    next = 'COMPLETE';
  } else if (allMatch('NDE_CLEAR', 'COMPLETE') && !['NDE_CLEAR', 'PRESSURE_TESTED', 'COATING', 'MARKING', 'COMPLETE'].includes(current)) {
    next = 'NDE_CLEAR';
  } else if (allMatch('NDE_PENDING', 'NDE_CLEAR', 'REPAIR', 'COMPLETE') && !['NDE_PENDING', 'NDE_CLEAR', 'PRESSURE_TESTED', 'COATING', 'MARKING', 'COMPLETE'].includes(current)) {
    next = 'NDE_PENDING';
  } else if (allMatch('WELDED', 'NDE_PENDING', 'NDE_CLEAR', 'REPAIR', 'COMPLETE') && !['WELDED', 'PWHT', 'NDE_PENDING', 'NDE_CLEAR', 'PRESSURE_TESTED', 'COATING', 'MARKING', 'COMPLETE'].includes(current)) {
    next = 'WELDED';
  } else if (statuses.some((s: string) => ['FIT_UP', 'WELDED', 'NDE_PENDING', 'NDE_CLEAR', 'REPAIR', 'COMPLETE'].includes(s))
    && !['FIT_UP', 'WELDED', 'PWHT', 'NDE_PENDING', 'NDE_CLEAR', 'PRESSURE_TESTED', 'COATING', 'MARKING', 'COMPLETE', 'HOLD'].includes(current)) {
    next = 'FIT_UP';
  }

  if (next && canTransition(SPOOL_TRANSITIONS, current, next)) {
    const result = await prisma.pipeSpool.updateMany({ where: { id: spoolId, status: current }, data: { status: next } });
    if (result.count === 0) {
      log.warn('recalcSpoolStatus skipped — spool status changed concurrently', { spoolId, expected: current });
      return;
    }
    await recordStatusChange('PipeSpool', spoolId, current, next, SYSTEM_ACTOR, 'Auto-advanced from joint status recalculation').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

/** Call after creating a weld record. Advances joint to WELDED and triggers spool recalc. */
export async function onWeldCreated(jointId: string): Promise<void> {
  const joint = await prisma.spoolJoint.findUnique({ where: { id: jointId } });
  if (!joint) return;

  const advanceable = ['PENDING', 'FIT_UP'];
  if (advanceable.includes(joint.status)) {
    const result = await prisma.spoolJoint.updateMany({ where: { id: jointId, status: joint.status }, data: { status: 'WELDED' } });
    if (result.count === 0) {
      log.warn('onWeldCreated skipped — joint status changed concurrently', { jointId, expected: joint.status });
      return;
    }
    await recordStatusChange('SpoolJoint', jointId, joint.status, 'WELDED', SYSTEM_ACTOR, 'Auto-advanced on weld record creation').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  }
  await recalcSpoolStatus(joint.spoolId);
}

/** Call after NDE result is saved. Advances joint status and fires alerts. */
export async function onNDEResult(
  jointId: string,
  result: string,         // ACCEPTABLE | REJECTABLE
  holdFlag: boolean,
): Promise<void> {
  const joint = await prisma.spoolJoint.findUnique({ where: { id: jointId } });
  if (!joint) return;

  if (result === 'ACCEPTABLE' && !holdFlag) {
    const updated = await prisma.spoolJoint.updateMany({
      where: { id: jointId, status: joint.status },
      data: { status: 'NDE_CLEAR', holdFlag: false },
    });
    if (updated.count === 0) {
      log.warn('onNDEResult (ACCEPTABLE) skipped — joint status changed concurrently', { jointId, expected: joint.status });
      return;
    }
    await recordStatusChange('SpoolJoint', jointId, joint.status, 'NDE_CLEAR', SYSTEM_ACTOR, `NDE result: ACCEPTABLE`).catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  } else if (result === 'REJECTABLE') {
    const updated = await prisma.spoolJoint.updateMany({
      where: { id: jointId, status: joint.status },
      data: { status: 'REPAIR', holdFlag: true },
    });
    if (updated.count === 0) {
      log.warn('onNDEResult (REJECTABLE) skipped — joint status changed concurrently', { jointId, expected: joint.status });
      return;
    }
    await recordStatusChange('SpoolJoint', jointId, joint.status, 'REPAIR', SYSTEM_ACTOR, 'NDE result: REJECTABLE — repair required').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
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
    }).catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  } else if (holdFlag) {
    const updated = await prisma.spoolJoint.updateMany({
      where: { id: jointId, status: joint.status },
      data: { status: 'NDE_PENDING', holdFlag: true },
    });
    if (updated.count === 0) {
      log.warn('onNDEResult (hold) skipped — joint status changed concurrently', { jointId, expected: joint.status });
      return;
    }
    await recordStatusChange('SpoolJoint', jointId, joint.status, 'NDE_PENDING', SYSTEM_ACTOR, 'NDE hold placed — pending review').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
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
    }).catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
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
      const updated = await prisma.pipeSpool.updateMany({ where: { id: spoolId, status: spool.status }, data: { status: target } });
      if (updated.count === 0) {
        log.warn('onPressureTestResult skipped — spool status changed concurrently', { spoolId, expected: spool.status });
        return;
      }
      await recordStatusChange('PipeSpool', spoolId, spool.status, target, SYSTEM_ACTOR, 'Pressure test PASSED').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
      await prisma.spoolAlert.create({
        data: {
          type: 'INSPECTION_FAILED',
          severity: 'INFO',
          title: `Pressure Test PASSED — ${spool.spoolId}`,
          message: `Spool ${spool.spoolId} pressure test passed → status: ${target}`,
          link: '/pipe-spool/pressure-tests',
          spoolId: spool.id,
          ncrId: null,
        },
      }).catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
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
    }).catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  }
}

/** Call after a fit-up inspection passes. Advances joint to FIT_UP. */
export async function onFitUpInspectionPass(jointId: string): Promise<void> {
  const joint = await prisma.spoolJoint.findUnique({ where: { id: jointId } });
  if (!joint) return;
  if (joint.status === 'PENDING') {
    const updated = await prisma.spoolJoint.updateMany({ where: { id: jointId, status: 'PENDING' }, data: { status: 'FIT_UP' } });
    if (updated.count === 0) {
      log.warn('onFitUpInspectionPass skipped — joint status changed concurrently', { jointId });
      return;
    }
    await recordStatusChange('SpoolJoint', jointId, 'PENDING', 'FIT_UP', SYSTEM_ACTOR, 'Fit-up inspection passed').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
    await recalcSpoolStatus(joint.spoolId);
  }
}

/** Call after a PWHT cycle is approved/completed. Advances spool PWHT → NDE_PENDING. */
export async function onPWHTComplete(spoolId: string): Promise<void> {
  const spool = await prisma.pipeSpool.findUnique({ where: { id: spoolId } });
  if (!spool || spool.status !== 'PWHT') return;
  if (canTransition(SPOOL_TRANSITIONS, 'PWHT', 'NDE_PENDING')) {
    const updated = await prisma.pipeSpool.updateMany({ where: { id: spoolId, status: 'PWHT' }, data: { status: 'NDE_PENDING' } });
    if (updated.count === 0) {
      log.warn('onPWHTComplete skipped — spool status changed concurrently', { spoolId });
      return;
    }
    await recordStatusChange('PipeSpool', spoolId, 'PWHT', 'NDE_PENDING', SYSTEM_ACTOR, 'PWHT cycle completed and approved').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  }
}

/** Call after coating is completed for a spool. Advances spool COATING → MARKING. */
export async function onCoatingComplete(spoolId: string): Promise<void> {
  const spool = await prisma.pipeSpool.findUnique({ where: { id: spoolId } });
  if (!spool || spool.status !== 'COATING') return;
  if (canTransition(SPOOL_TRANSITIONS, 'COATING', 'MARKING')) {
    const updated = await prisma.pipeSpool.updateMany({ where: { id: spoolId, status: 'COATING' }, data: { status: 'MARKING' } });
    if (updated.count === 0) {
      log.warn('onCoatingComplete skipped — spool status changed concurrently', { spoolId });
      return;
    }
    await recordStatusChange('PipeSpool', spoolId, 'COATING', 'MARKING', SYSTEM_ACTOR, 'Coating complete — spool advanced to marking').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  }
}

/** Call after identification marking is complete. Advances spool MARKING → COMPLETE. */
export async function onMarkingComplete(spoolId: string): Promise<void> {
  const spool = await prisma.pipeSpool.findUnique({ where: { id: spoolId } });
  if (!spool || spool.status !== 'MARKING') return;
  if (canTransition(SPOOL_TRANSITIONS, 'MARKING', 'COMPLETE')) {
    const updated = await prisma.pipeSpool.updateMany({ where: { id: spoolId, status: 'MARKING' }, data: { status: 'COMPLETE' } });
    if (updated.count === 0) {
      log.warn('onMarkingComplete skipped — spool status changed concurrently', { spoolId });
      return;
    }
    await recordStatusChange('PipeSpool', spoolId, 'MARKING', 'COMPLETE', SYSTEM_ACTOR, 'Marking complete — spool fabrication COMPLETE').catch((e) => { log.warn('spoolFlow side-effect write failed', { message: e instanceof Error ? e.message : String(e) }); });
  }
}
