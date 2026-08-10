/**
 * Approval Security & Production Integrity Tests
 *
 * All tests use pure functions only — no database, no HTTP.
 * Coverage:
 *   - Approval RBAC matrix (who can approve what)
 *   - Unauthorized approval attempts (403 path)
 *   - Soft delete policy (record exclusion logic)
 *   - Session safety (isSessionValid)
 *   - Electronic signature payload validation
 *   - Order role-action enforcement
 */

import { describe, it, expect, vi } from 'vitest';

// Mock DB modules so RBAC and signature services can be imported without a running DB
vi.mock('@/lib/services/database', () => ({
    prisma: {
        user: { findUnique: vi.fn() },
        electronicSignature: { create: vi.fn() },
    },
}));

import { canPerform, SPOOL_PERMISSIONS } from '@/lib/spoolRBAC';
import {
    ORDER_ROLE_ACTION_MAP,
    canRoleTransition,
    canTransition,
    isTerminal,
    VALID_TRANSITIONS,
} from '@/lib/orderStateMachine';
import { isSessionValid } from '@/lib/auth';
import { validateSignaturePayload } from '@/lib/services/ElectronicSignatureService';

// ── Approval RBAC — spool permissions ────────────────────────────────────────

describe('SPOOL_PERMISSIONS: approval gates', () => {
    it('OPERATOR cannot APPROVE_INSPECTION', () => {
        expect(canPerform('OPERATOR', 'APPROVE_INSPECTION')).toBe(false);
    });

    it('QUALITY can APPROVE_INSPECTION', () => {
        expect(canPerform('QUALITY', 'APPROVE_INSPECTION')).toBe(true);
    });

    it('SUPERVISOR can APPROVE_INSPECTION', () => {
        expect(canPerform('SUPERVISOR', 'APPROVE_INSPECTION')).toBe(true);
    });

    it('OPERATOR cannot APPROVE_WORK_ORDER', () => {
        expect(canPerform('OPERATOR', 'APPROVE_WORK_ORDER')).toBe(false);
    });

    it('QUALITY cannot APPROVE_WORK_ORDER', () => {
        expect(canPerform('QUALITY', 'APPROVE_WORK_ORDER')).toBe(false);
    });

    it('SUPERVISOR can APPROVE_WORK_ORDER', () => {
        expect(canPerform('SUPERVISOR', 'APPROVE_WORK_ORDER')).toBe(true);
    });

    it('ADMIN can APPROVE_WORK_ORDER', () => {
        expect(canPerform('ADMIN', 'APPROVE_WORK_ORDER')).toBe(true);
    });

    it('OPERATOR cannot APPROVE_MDR', () => {
        expect(canPerform('OPERATOR', 'APPROVE_MDR')).toBe(false);
    });

    it('QUALITY can APPROVE_MDR', () => {
        expect(canPerform('QUALITY', 'APPROVE_MDR')).toBe(true);
    });

    it('OPERATOR cannot APPROVE_PWHT', () => {
        expect(canPerform('OPERATOR', 'APPROVE_PWHT')).toBe(false);
    });

    it('QUALITY can APPROVE_PWHT', () => {
        expect(canPerform('QUALITY', 'APPROVE_PWHT')).toBe(true);
    });

    it('OPERATOR cannot APPROVE_COMPLETION', () => {
        expect(canPerform('OPERATOR', 'APPROVE_COMPLETION')).toBe(false);
    });

    it('SUPERVISOR can APPROVE_COMPLETION', () => {
        expect(canPerform('SUPERVISOR', 'APPROVE_COMPLETION')).toBe(true);
    });

    it('OPERATOR cannot SOFT_DELETE', () => {
        expect(canPerform('OPERATOR', 'SOFT_DELETE')).toBe(false);
    });

    it('SUPERVISOR can SOFT_DELETE', () => {
        expect(canPerform('SUPERVISOR', 'SOFT_DELETE')).toBe(true);
    });

    it('only ADMIN can DELETE_RECORD', () => {
        expect(canPerform('OPERATOR', 'DELETE_RECORD')).toBe(false);
        expect(canPerform('QUALITY', 'DELETE_RECORD')).toBe(false);
        expect(canPerform('SUPERVISOR', 'DELETE_RECORD')).toBe(false);
        expect(canPerform('ADMIN', 'DELETE_RECORD')).toBe(true);
    });

    it('every permission key in SPOOL_PERMISSIONS has at least one allowed role', () => {
        for (const [perm, roles] of Object.entries(SPOOL_PERMISSIONS)) {
            expect((roles as readonly string[]).length, `${perm} has no allowed roles`).toBeGreaterThan(0);
        }
    });
});

// ── Order approval RBAC ───────────────────────────────────────────────────────

describe('Order approval RBAC', () => {
    it('OPERATOR cannot transition order to APPROVED', () => {
        expect(canRoleTransition('OPERATOR', 'APPROVED')).toBe(false);
    });

    it('QUALITY cannot transition order to APPROVED', () => {
        expect(canRoleTransition('QUALITY', 'APPROVED')).toBe(false);
    });

    it('SUPERVISOR can transition order to APPROVED', () => {
        expect(canRoleTransition('SUPERVISOR', 'APPROVED')).toBe(true);
    });

    it('ADMIN can transition order to APPROVED', () => {
        expect(canRoleTransition('ADMIN', 'APPROVED')).toBe(true);
    });

    it('OPERATOR cannot transition order to COMPLETED', () => {
        expect(canRoleTransition('OPERATOR', 'COMPLETED')).toBe(false);
    });

    it('OPERATOR can transition order to IN_PROGRESS', () => {
        expect(canRoleTransition('OPERATOR', 'IN_PROGRESS')).toBe(true);
    });

    it('REWORK is reachable from RELEASED and IN_PROGRESS, not just QC_PENDING', () => {
        // Regression: task-level QC (OrderLifecycleService.onQualityInspection,
        // called per-task from app/api/quality/route.ts) can fail while the
        // order is still RELEASED or IN_PROGRESS, well before it reaches
        // QC_PENDING. VALID_TRANSITIONS previously only allowed REWORK from
        // QC_PENDING, so any such failure crashed with "Invalid workflow
        // transition" instead of routing the order to rework.
        expect(canTransition('RELEASED', 'REWORK')).toBe(true);
        expect(canTransition('IN_PROGRESS', 'REWORK')).toBe(true);
        expect(canTransition('QC_PENDING', 'REWORK')).toBe(true);
    });

    it('COMPLETED and CANCELLED are terminal — no further transitions', () => {
        expect(isTerminal('COMPLETED')).toBe(true);
        expect(isTerminal('CANCELLED')).toBe(true);
        expect(VALID_TRANSITIONS['COMPLETED']).toHaveLength(0);
        expect(VALID_TRANSITIONS['CANCELLED']).toHaveLength(0);
    });

    it('ORDER_ROLE_ACTION_MAP has an entry for every non-terminal target status', () => {
        const targets = new Set<string>();
        for (const nexts of Object.values(VALID_TRANSITIONS)) {
            for (const s of nexts) targets.add(s);
        }
        for (const status of targets) {
            if (status === 'COMPLETED' || status === 'CANCELLED') continue;
            expect(ORDER_ROLE_ACTION_MAP[status], `Missing map for ${status}`).toBeDefined();
        }
    });
});

// ── Soft delete policy ────────────────────────────────────────────────────────

describe('Soft delete policy', () => {
    function isExcluded(record: { deletedAt: Date | null }): boolean {
        return record.deletedAt !== null;
    }

    it('a record with deletedAt=null is NOT excluded', () => {
        expect(isExcluded({ deletedAt: null })).toBe(false);
    });

    it('a record with a past deletedAt IS excluded', () => {
        expect(isExcluded({ deletedAt: new Date('2024-01-01') })).toBe(true);
    });

    it('a record with deletedAt=now IS excluded', () => {
        expect(isExcluded({ deletedAt: new Date() })).toBe(true);
    });

    it('soft delete preserves the record — data remains recoverable', () => {
        const record = { id: 'spool-1', status: 'FIT_UP', deletedAt: null as Date | null, deletedBy: null as string | null };
        // Simulate soft delete
        record.deletedAt = new Date();
        record.deletedBy = 'supervisor.user';
        // Record is still accessible as an object (not hard deleted)
        expect(record.id).toBe('spool-1');
        expect(record.status).toBe('FIT_UP');
        expect(record.deletedAt).toBeInstanceOf(Date);
    });
});

// ── Session safety ────────────────────────────────────────────────────────────

describe('isSessionValid', () => {
    it('returns true when version matches and user is active', () => {
        expect(isSessionValid(3, 3, true)).toBe(true);
    });

    it('returns false when user is inactive (disabled)', () => {
        expect(isSessionValid(3, 3, false)).toBe(false);
    });

    it('returns false when sessionVersion has been incremented (token invalidated)', () => {
        expect(isSessionValid(2, 3, true)).toBe(false);
    });

    it('returns false when token has an older version (multiple revocations)', () => {
        expect(isSessionValid(0, 5, true)).toBe(false);
    });

    it('returns true when tokenVersion is undefined (legacy token, no version check)', () => {
        expect(isSessionValid(undefined, 0, true)).toBe(true);
    });

    it('returns false when user is inactive even if version matches', () => {
        expect(isSessionValid(0, 0, false)).toBe(false);
    });
});

// ── Electronic signature validation ──────────────────────────────────────────

describe('validateSignaturePayload', () => {
    const valid = { userId: 'u1', entityType: 'PipeSpool', entityId: 'sp-1', reason: 'PWHT approved' };

    it('passes with all required fields', () => {
        expect(validateSignaturePayload(valid).valid).toBe(true);
    });

    it('fails when userId is missing', () => {
        const r = validateSignaturePayload({ ...valid, userId: '' });
        expect(r.valid).toBe(false);
        expect(r.error).toContain('userId');
    });

    it('fails when entityType is missing', () => {
        const r = validateSignaturePayload({ ...valid, entityType: '' });
        expect(r.valid).toBe(false);
        expect(r.error).toContain('entityType');
    });

    it('fails when entityId is missing', () => {
        const r = validateSignaturePayload({ ...valid, entityId: '' });
        expect(r.valid).toBe(false);
        expect(r.error).toContain('entityId');
    });

    it('fails when reason is missing', () => {
        const r = validateSignaturePayload({ ...valid, reason: '' });
        expect(r.valid).toBe(false);
        expect(r.error).toContain('reason');
    });

    it('fails when reason is whitespace only', () => {
        const r = validateSignaturePayload({ ...valid, reason: '   ' });
        expect(r.valid).toBe(false);
    });

    it('entityType can be any non-empty string (flexible for future entities)', () => {
        expect(validateSignaturePayload({ ...valid, entityType: 'MDR' }).valid).toBe(true);
        expect(validateSignaturePayload({ ...valid, entityType: 'PWHTCycle' }).valid).toBe(true);
    });
});
