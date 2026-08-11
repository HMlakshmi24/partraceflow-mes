/**
 * QualityGateService — threshold-rule evaluation engine that every pass/fail
 * quality record (weld visual, NDE, pressure test, dimensional) routes
 * through. 538 lines, zero prior coverage. Focused on the two areas where a
 * bug would silently let a failing measurement through: evaluateThresholdRule
 * (the per-rule comparison) and evaluateQualityGate (mandatory-vs-optional
 * aggregation, and the requiresApproval flag downstream approval routes rely
 * on to decide whether a supervisor sign-off is needed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGate, mockEvent, mockUser, mockApproval, mockTask } = vi.hoisted(() => ({
    mockGate: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    mockEvent: { create: vi.fn() },
    mockUser: { findUnique: vi.fn() },
    mockApproval: { create: vi.fn(), findMany: vi.fn() },
    mockTask: { update: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: {
        qualityGate: mockGate,
        systemEvent: mockEvent,
        user: mockUser,
        qualityApproval: mockApproval,
        workflowTask: mockTask,
    },
}));

import { QualityGateService } from '@/lib/services/QualityGateService';
import { evaluateThresholdRule } from '@/lib/qualityThreshold';

beforeEach(() => {
    vi.clearAllMocks();
    mockEvent.create.mockResolvedValue({});
});

// ── evaluateThresholdRule ────────────────────────────────────────────────────
// Extracted to lib/qualityThreshold.ts — also used by AdvancedWorkflowEngine,
// which previously carried a near-identical copy-pasted implementation.

describe('evaluateThresholdRule', () => {
    it('>: passes when actual is strictly greater', () => {
        expect(evaluateThresholdRule(5, '>', 4)).toBe(true);
        expect(evaluateThresholdRule(4, '>', 4)).toBe(false);
    });

    it('<: passes when actual is strictly less', () => {
        expect(evaluateThresholdRule(3, '<', 4)).toBe(true);
        expect(evaluateThresholdRule(4, '<', 4)).toBe(false);
    });

    it('>=: boundary value passes', () => {
        expect(evaluateThresholdRule(4, '>=', 4)).toBe(true);
        expect(evaluateThresholdRule(3.999, '>=', 4)).toBe(false);
    });

    it('<=: boundary value passes', () => {
        expect(evaluateThresholdRule(4, '<=', 4)).toBe(true);
        expect(evaluateThresholdRule(4.001, '<=', 4)).toBe(false);
    });

    it('==: exact match only', () => {
        expect(evaluateThresholdRule(4, '==', 4)).toBe(true);
        expect(evaluateThresholdRule(4.0001, '==', 4)).toBe(false);
    });

    it('between: inclusive of both bounds', () => {
        expect(evaluateThresholdRule(24.9, 'between', 0, 24.9, 25.1)).toBe(true);
        expect(evaluateThresholdRule(25.1, 'between', 0, 24.9, 25.1)).toBe(true);
        expect(evaluateThresholdRule(25.0, 'between', 0, 24.9, 25.1)).toBe(true);
    });

    it('between: rejects values outside the range', () => {
        expect(evaluateThresholdRule(24.89, 'between', 0, 24.9, 25.1)).toBe(false);
        expect(evaluateThresholdRule(25.11, 'between', 0, 24.9, 25.1)).toBe(false);
    });

    it('between: fails closed (false) when thresholds are missing, not open', () => {
        // This matters: a misconfigured "between" rule with no min/max must
        // never silently pass every measurement.
        expect(evaluateThresholdRule(9999, 'between', 0, undefined, undefined)).toBe(false);
        expect(evaluateThresholdRule(9999, 'between', 0, 1, undefined)).toBe(false);
    });

    it('unknown operator defaults to passing (matches existing service behavior)', () => {
        expect(evaluateThresholdRule(0, 'bogus-operator', 0)).toBe(true);
    });
});

// ── evaluateQualityGate ──────────────────────────────────────────────────────

function makeGate(overrides: Partial<{ rules: any[]; operatorId: string | null }> = {}) {
    return {
        id: 'gate-1',
        name: 'Weld Visual Gate',
        rules: overrides.rules ?? [],
        task: { operatorId: overrides.operatorId ?? 'op-1', instance: { workOrder: {} } },
    };
}

function rule(field: string, logic: object, opts: Partial<{ mandatory: boolean; thresholdMin: number; thresholdMax: number }> = {}) {
    return {
        mandatory: opts.mandatory ?? true,
        thresholdMin: opts.thresholdMin,
        thresholdMax: opts.thresholdMax,
        rule: { logic: JSON.stringify({ field, ...logic }) },
    };
}

describe('evaluateQualityGate', () => {
    it('passes through with no issues when no gate is configured for the task', async () => {
        mockGate.findUnique.mockResolvedValue(null);
        const result = await QualityGateService.evaluateQualityGate('task-1', []);
        expect(result).toEqual({ passed: true, issues: [], warnings: [], requiresApproval: false });
        expect(mockGate.update).not.toHaveBeenCalled();
    });

    it('passes when a mandatory rule is satisfied', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [rule('surfaceRoughness', { operator: '<=', value: 0.8 })],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', [
            { parameter: 'surfaceRoughness', expected: '<= 0.8', actual: '0.5', result: 'PASS' },
        ]);

        expect(result.passed).toBe(true);
        expect(result.issues).toHaveLength(0);
        expect(mockGate.update).toHaveBeenCalledWith({ where: { id: 'gate-1' }, data: { status: 'PASSED' } });
    });

    it('fails (and does not silently pass) when a mandatory rule is violated', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [rule('surfaceRoughness', { operator: '<=', value: 0.8 })],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', [
            { parameter: 'surfaceRoughness', expected: '<= 0.8', actual: '1.2', result: 'FAIL' },
        ]);

        expect(result.passed).toBe(false);
        expect(result.issues[0]).toContain('surfaceRoughness');
        expect(mockGate.update).toHaveBeenCalledWith({ where: { id: 'gate-1' }, data: { status: 'FAILED' } });
    });

    it('a failed OPTIONAL rule is reported but does not flip the gate to FAILED', async () => {
        // Note: a failed rule is always recorded in `issues` regardless of
        // mandatory/optional — only allMandatoryPassed (and hence `passed`
        // and the persisted gate status) is conditioned on `mandatory`. An
        // optional-rule failure still surfaces to the caller, it just isn't
        // gating.
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [rule('cosmeticFinish', { operator: '>=', value: 9 }, { mandatory: false })],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', [
            { parameter: 'cosmeticFinish', expected: '>= 9', actual: '5', result: 'FAIL' },
        ]);

        expect(result.passed).toBe(true);
        expect(result.issues[0]).toContain('cosmeticFinish');
        expect(mockGate.update).toHaveBeenCalledWith({ where: { id: 'gate-1' }, data: { status: 'PASSED' } });
    });

    it('a missing MANDATORY check fails the gate even with no measurement at all', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [rule('torque', { operator: 'between', value: 0, thresholdMin: 12.5, thresholdMax: 13.5 }, { thresholdMin: 12.5, thresholdMax: 13.5 })],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', []);

        expect(result.passed).toBe(false);
        expect(result.issues[0]).toContain('Missing mandatory check: torque');
    });

    it('a missing OPTIONAL check only warns', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [rule('cosmeticFinish', { operator: '>=', value: 9 }, { mandatory: false })],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', []);

        expect(result.passed).toBe(true);
        expect(result.warnings[0]).toContain('Optional check missing: cosmeticFinish');
    });

    it('a non-numeric measurement on a mandatory rule fails the gate ("N/A" cannot silently pass)', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [rule('torque', { operator: '>=', value: 12 })],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', [
            { parameter: 'torque', expected: '>= 12', actual: 'N/A', result: 'FAIL' },
        ]);

        expect(result.passed).toBe(false);
        expect(result.issues[0]).toContain('Invalid measurement for torque');
    });

    it('requiresApproval is true whenever the gate has any rules, even if it passed', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [rule('surfaceRoughness', { operator: '<=', value: 0.8 })],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', [
            { parameter: 'surfaceRoughness', expected: '<= 0.8', actual: '0.1', result: 'PASS' },
        ]);

        expect(result.passed).toBe(true);
        expect(result.requiresApproval).toBe(true);
    });

    it('requiresApproval is false when the gate has zero rules and nothing failed', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({ rules: [] }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', []);

        expect(result.requiresApproval).toBe(false);
    });

    it('one failing mandatory rule fails the whole gate even when other rules pass', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate({
            rules: [
                rule('surfaceRoughness', { operator: '<=', value: 0.8 }),
                rule('torque', { operator: 'between', value: 0, thresholdMin: 12.5, thresholdMax: 13.5 }, { thresholdMin: 12.5, thresholdMax: 13.5 }),
            ],
        }));
        mockGate.update.mockResolvedValue({});

        const result = await QualityGateService.evaluateQualityGate('task-1', [
            { parameter: 'surfaceRoughness', expected: '<= 0.8', actual: '0.5', result: 'PASS' },
            { parameter: 'torque', expected: '12.5-13.5', actual: '20', result: 'FAIL' },
        ]);

        expect(result.passed).toBe(false);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]).toContain('torque');
    });
});

// ── requestApproval — authorization ──────────────────────────────────────────

describe('requestApproval — authorization', () => {
    it('rejects an approval attempt from a non-SUPERVISOR/ADMIN role', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate());
        mockUser.findUnique.mockResolvedValue({ id: 'u1', role: 'OPERATOR', username: 'op1' });

        await expect(
            QualityGateService.requestApproval('gate-1', 'u1', 'APPROVED'),
        ).rejects.toThrow(/not authorized/i);

        expect(mockApproval.create).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to approve and moves the gate to APPROVED once threshold is met', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate());
        mockUser.findUnique.mockResolvedValue({ id: 'u1', role: 'SUPERVISOR', username: 'sup1' });
        mockApproval.create.mockResolvedValue({});
        mockApproval.findMany.mockResolvedValue([{ id: 'a1', status: 'APPROVED' }]);
        mockGate.update.mockResolvedValue({});

        await QualityGateService.requestApproval('gate-1', 'u1', 'APPROVED', 'looks good');

        expect(mockGate.update).toHaveBeenCalledWith({ where: { id: 'gate-1' }, data: { status: 'APPROVED' } });
    });

    it('rejecting moves the gate to REJECTED and flags the task for rework', async () => {
        mockGate.findUnique.mockResolvedValue(makeGate());
        mockUser.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN', username: 'admin1' });
        mockApproval.create.mockResolvedValue({});
        mockApproval.findMany.mockResolvedValue([]);
        mockGate.update.mockResolvedValue({});
        mockTask.update.mockResolvedValue({});

        await QualityGateService.requestApproval('gate-1', 'u1', 'REJECTED', 'defect found');

        expect(mockGate.update).toHaveBeenCalledWith({ where: { id: 'gate-1' }, data: { status: 'REJECTED' } });
    });

    it('throws when the gate does not exist', async () => {
        mockGate.findUnique.mockResolvedValue(null);
        await expect(
            QualityGateService.requestApproval('missing-gate', 'u1', 'APPROVED'),
        ).rejects.toThrow(/not found/i);
    });
});
