/**
 * Workflow Pipeline Verification
 *
 * Tests the complete WorkOrder → PipeSpool → Joint → Inspect → Complete
 * state-machine chain using pure functions — no database required.
 *
 * Run:  npm test
 */

import { describe, it, expect } from 'vitest';
import {
    canTransition as canOrderTransition,
    getTransitionError,
    getNextActions,
    isTerminal,
    VALID_TRANSITIONS,
    STATUS_LABELS,
} from '@/lib/orderStateMachine';
import {
    canTransition,
    spoolTransitionError,
    jointTransitionError,
    SPOOL_TRANSITIONS,
    JOINT_TRANSITIONS,
} from '@/lib/spoolTransitions';

// ── WorkOrder state machine ───────────────────────────────────────────────────

describe('WorkOrder state machine', () => {
    const GOLDEN_PATH = [
        'PLANNED', 'RELEASED', 'IN_PROGRESS', 'QC_PENDING', 'APPROVED', 'COMPLETED',
    ] as const;

    it('allows the full golden-path pipeline', () => {
        for (let i = 0; i < GOLDEN_PATH.length - 1; i++) {
            expect(canOrderTransition(GOLDEN_PATH[i], GOLDEN_PATH[i + 1])).toBe(true);
        }
    });

    it('blocks skipping steps', () => {
        expect(canOrderTransition('PLANNED', 'IN_PROGRESS')).toBe(false);
        expect(canOrderTransition('PLANNED', 'COMPLETED')).toBe(false);
        expect(canOrderTransition('RELEASED', 'APPROVED')).toBe(false);
        expect(canOrderTransition('IN_PROGRESS', 'COMPLETED')).toBe(false);
    });

    it('blocks re-opening a COMPLETED order', () => {
        expect(canOrderTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
        expect(canOrderTransition('COMPLETED', 'PLANNED')).toBe(false);
        expect(isTerminal('COMPLETED')).toBe(true);
    });

    it('blocks re-opening a CANCELLED order', () => {
        expect(isTerminal('CANCELLED')).toBe(true);
        for (const status of Object.keys(VALID_TRANSITIONS)) {
            if (status !== 'CANCELLED') {
                expect(canOrderTransition('CANCELLED', status)).toBe(false);
            }
        }
    });

    it('allows ON_HOLD to resume to RELEASED or IN_PROGRESS', () => {
        expect(canOrderTransition('ON_HOLD', 'RELEASED')).toBe(true);
        expect(canOrderTransition('ON_HOLD', 'IN_PROGRESS')).toBe(true);
        expect(canOrderTransition('ON_HOLD', 'APPROVED')).toBe(false);
    });

    it('allows REWORK → IN_PROGRESS', () => {
        expect(canOrderTransition('REWORK', 'IN_PROGRESS')).toBe(true);
        expect(canOrderTransition('REWORK', 'COMPLETED')).toBe(false);
    });

    it('returns descriptive error messages', () => {
        const msg = getTransitionError('PLANNED', 'COMPLETED');
        expect(msg).toContain('Planned');
        expect(msg).toContain('Completed');
    });

    it('returns correct allowed next actions', () => {
        expect(getNextActions('PLANNED')).toContain('RELEASED');
        expect(getNextActions('COMPLETED')).toHaveLength(0);
    });

    it('every status in VALID_TRANSITIONS has a STATUS_LABELS entry', () => {
        for (const status of Object.keys(VALID_TRANSITIONS)) {
            expect(STATUS_LABELS[status]).toBeDefined();
        }
    });
});

// ── PipeSpool state machine ───────────────────────────────────────────────────

describe('PipeSpool state machine', () => {
    const GOLDEN_PATH = [
        'FABRICATING', 'RECEIVED', 'IN_STORAGE', 'ISSUED',
        'FIT_UP', 'WELDED', 'NDE_PENDING', 'NDE_CLEAR',
        'PRESSURE_TESTED', 'COMPLETE',
    ] as const;

    it('allows the full golden-path pipeline', () => {
        for (let i = 0; i < GOLDEN_PATH.length - 1; i++) {
            const ok = canTransition(SPOOL_TRANSITIONS, GOLDEN_PATH[i], GOLDEN_PATH[i + 1]);
            expect(ok, `${GOLDEN_PATH[i]} → ${GOLDEN_PATH[i + 1]}`).toBe(true);
        }
    });

    it('blocks skipping steps', () => {
        expect(canTransition(SPOOL_TRANSITIONS, 'FABRICATING', 'ISSUED')).toBe(false);
        expect(canTransition(SPOOL_TRANSITIONS, 'FABRICATING', 'WELDED')).toBe(false);
        expect(canTransition(SPOOL_TRANSITIONS, 'RECEIVED', 'COMPLETE')).toBe(false);
        expect(canTransition(SPOOL_TRANSITIONS, 'IN_STORAGE', 'FIT_UP')).toBe(false);
    });

    it('blocks any transition from COMPLETE', () => {
        expect(SPOOL_TRANSITIONS['COMPLETE']).toHaveLength(0);
        for (const target of Object.keys(SPOOL_TRANSITIONS)) {
            if (target !== 'COMPLETE') {
                expect(canTransition(SPOOL_TRANSITIONS, 'COMPLETE', target)).toBe(false);
            }
        }
    });

    it('allows HOLD from all non-terminal spool states', () => {
        // Bug 1 fixed: NDE_CLEAR now supports HOLD so a spool can be held after NDE examination.
        // PWHT, COATING, MARKING added in Phase 3.
        const holdable = [
            'FABRICATING', 'RECEIVED', 'IN_STORAGE', 'ISSUED',
            'FIT_UP', 'WELDED', 'PWHT',
            'NDE_PENDING', 'NDE_CLEAR', 'REPAIR',
            'PRESSURE_TESTED', 'COATING', 'MARKING',
        ];
        for (const s of holdable) {
            expect(canTransition(SPOOL_TRANSITIONS, s, 'HOLD'), `${s} → HOLD`).toBe(true);
        }
        expect(canTransition(SPOOL_TRANSITIONS, 'COMPLETE', 'HOLD')).toBe(false);
    });

    it('allows HOLD to return to all non-terminal states', () => {
        const resumable = ['FABRICATING', 'RECEIVED', 'IN_STORAGE', 'ISSUED', 'FIT_UP', 'WELDED', 'NDE_PENDING', 'REPAIR'];
        for (const s of resumable) {
            expect(canTransition(SPOOL_TRANSITIONS, 'HOLD', s), `HOLD → ${s}`).toBe(true);
        }
    });

    it('allows NDE_PENDING → REPAIR → NDE_PENDING (repair cycle)', () => {
        expect(canTransition(SPOOL_TRANSITIONS, 'NDE_PENDING', 'REPAIR')).toBe(true);
        expect(canTransition(SPOOL_TRANSITIONS, 'REPAIR', 'NDE_PENDING')).toBe(true);
    });

    it('allows IN_STORAGE → ISSUED but not ISSUED → IN_STORAGE directly from the golden path', () => {
        expect(canTransition(SPOOL_TRANSITIONS, 'IN_STORAGE', 'ISSUED')).toBe(true);
        expect(canTransition(SPOOL_TRANSITIONS, 'ISSUED', 'IN_STORAGE')).toBe(true); // return to storage
    });

    it('returns a descriptive error for invalid transitions', () => {
        const msg = spoolTransitionError('FABRICATING', 'COMPLETE');
        expect(msg).toContain('FABRICATING');
        expect(msg).toContain('COMPLETE');
    });
});

// ── SpoolJoint state machine ──────────────────────────────────────────────────

describe('SpoolJoint state machine', () => {
    const GOLDEN_PATH = [
        'PENDING', 'FIT_UP', 'WELDED', 'NDE_PENDING', 'NDE_CLEAR', 'COMPLETE',
    ] as const;

    it('allows the full golden-path pipeline', () => {
        for (let i = 0; i < GOLDEN_PATH.length - 1; i++) {
            const ok = canTransition(JOINT_TRANSITIONS, GOLDEN_PATH[i], GOLDEN_PATH[i + 1]);
            expect(ok, `${GOLDEN_PATH[i]} → ${GOLDEN_PATH[i + 1]}`).toBe(true);
        }
    });

    it('blocks skipping steps', () => {
        expect(canTransition(JOINT_TRANSITIONS, 'PENDING', 'WELDED')).toBe(false);
        expect(canTransition(JOINT_TRANSITIONS, 'PENDING', 'COMPLETE')).toBe(false);
        expect(canTransition(JOINT_TRANSITIONS, 'FIT_UP', 'NDE_PENDING')).toBe(false);
    });

    it('blocks transitions from COMPLETE', () => {
        expect(JOINT_TRANSITIONS['COMPLETE']).toHaveLength(0);
    });

    it('allows repair cycle: NDE_PENDING → REPAIR → NDE_PENDING', () => {
        expect(canTransition(JOINT_TRANSITIONS, 'NDE_PENDING', 'REPAIR')).toBe(true);
        expect(canTransition(JOINT_TRANSITIONS, 'REPAIR', 'NDE_PENDING')).toBe(true);
    });

    it('allows FIT_UP to go back to PENDING', () => {
        expect(canTransition(JOINT_TRANSITIONS, 'FIT_UP', 'PENDING')).toBe(true);
    });

    it('returns a descriptive error for invalid transitions', () => {
        const msg = jointTransitionError('PENDING', 'COMPLETE');
        expect(msg).toContain('PENDING');
        expect(msg).toContain('COMPLETE');
    });
});

// ── End-to-end workflow pipeline ─────────────────────────────────────────────

describe('End-to-end: WorkOrder → PipeSpool → Joint → Inspect → Complete', () => {
    it('simulates a full production run through all three state machines', () => {
        // 1. WorkOrder: PLANNED → RELEASED → IN_PROGRESS
        expect(canOrderTransition('PLANNED', 'RELEASED')).toBe(true);
        expect(canOrderTransition('RELEASED', 'IN_PROGRESS')).toBe(true);

        // 2. PipeSpool: created as FABRICATING → RECEIVED → IN_STORAGE → ISSUED
        expect(canTransition(SPOOL_TRANSITIONS, 'FABRICATING', 'RECEIVED')).toBe(true);
        expect(canTransition(SPOOL_TRANSITIONS, 'RECEIVED', 'IN_STORAGE')).toBe(true);
        expect(canTransition(SPOOL_TRANSITIONS, 'IN_STORAGE', 'ISSUED')).toBe(true);

        // 3. Joint: PENDING → FIT_UP (triggered by fit-up inspection pass)
        expect(canTransition(JOINT_TRANSITIONS, 'PENDING', 'FIT_UP')).toBe(true);

        // 4. Spool auto-advances: ISSUED → FIT_UP (first joint in FIT_UP)
        expect(canTransition(SPOOL_TRANSITIONS, 'ISSUED', 'FIT_UP')).toBe(true);

        // 5. Joint: FIT_UP → WELDED (triggered by weld record creation)
        expect(canTransition(JOINT_TRANSITIONS, 'FIT_UP', 'WELDED')).toBe(true);

        // 6. Spool auto-advances: FIT_UP → WELDED
        expect(canTransition(SPOOL_TRANSITIONS, 'FIT_UP', 'WELDED')).toBe(true);

        // 7. Joint: WELDED → NDE_PENDING (NDE initiated)
        expect(canTransition(JOINT_TRANSITIONS, 'WELDED', 'NDE_PENDING')).toBe(true);

        // 8. Spool auto-advances: WELDED → NDE_PENDING
        expect(canTransition(SPOOL_TRANSITIONS, 'WELDED', 'NDE_PENDING')).toBe(true);

        // 9. Joint: NDE_PENDING → NDE_CLEAR (NDE accepted)
        expect(canTransition(JOINT_TRANSITIONS, 'NDE_PENDING', 'NDE_CLEAR')).toBe(true);

        // 10. Spool auto-advances: NDE_PENDING → NDE_CLEAR
        expect(canTransition(SPOOL_TRANSITIONS, 'NDE_PENDING', 'NDE_CLEAR')).toBe(true);

        // 11. Joint: NDE_CLEAR → COMPLETE
        expect(canTransition(JOINT_TRANSITIONS, 'NDE_CLEAR', 'COMPLETE')).toBe(true);

        // 12. Pressure test → spool: NDE_CLEAR → PRESSURE_TESTED → COMPLETE
        expect(canTransition(SPOOL_TRANSITIONS, 'NDE_CLEAR', 'PRESSURE_TESTED')).toBe(true);
        expect(canTransition(SPOOL_TRANSITIONS, 'PRESSURE_TESTED', 'COMPLETE')).toBe(true);

        // 13. WorkOrder: IN_PROGRESS → QC_PENDING → APPROVED → COMPLETED
        expect(canOrderTransition('IN_PROGRESS', 'QC_PENDING')).toBe(true);
        expect(canOrderTransition('QC_PENDING', 'APPROVED')).toBe(true);
        expect(canOrderTransition('APPROVED', 'COMPLETED')).toBe(true);
    });

    it('blocks a spool completing if a joint is still in NDE_PENDING', () => {
        // NDE_PENDING spool cannot skip to COMPLETE
        expect(canTransition(SPOOL_TRANSITIONS, 'NDE_PENDING', 'COMPLETE')).toBe(false);
    });

    it('blocks a WorkOrder completing if it has not been approved', () => {
        expect(canOrderTransition('QC_PENDING', 'COMPLETED')).toBe(false);
        expect(canOrderTransition('IN_PROGRESS', 'COMPLETED')).toBe(false);
    });

    it('NDE repair cycle resolves back to golden path', () => {
        // Joint goes through repair
        expect(canTransition(JOINT_TRANSITIONS, 'NDE_PENDING', 'REPAIR')).toBe(true);
        expect(canTransition(JOINT_TRANSITIONS, 'REPAIR', 'NDE_PENDING')).toBe(true);
        expect(canTransition(JOINT_TRANSITIONS, 'NDE_PENDING', 'NDE_CLEAR')).toBe(true);
        expect(canTransition(JOINT_TRANSITIONS, 'NDE_CLEAR', 'COMPLETE')).toBe(true);
    });

    it('Work order rework cycle resolves back to golden path', () => {
        expect(canOrderTransition('QC_PENDING', 'REWORK')).toBe(true);
        expect(canOrderTransition('REWORK', 'IN_PROGRESS')).toBe(true);
        expect(canOrderTransition('IN_PROGRESS', 'QC_PENDING')).toBe(true);
    });
});
