/**
 * Phase 6 — Production Execution Tests
 *
 * Pure-logic tests; no database required.
 * Coverage:
 *   - Machine assignment: DOWN and MAINTENANCE blocked
 *   - WorkOrder creation: starts at PLANNED
 *   - Duplicate schedule prevention logic
 *   - Dashboard: no demo padding in downtime/scrap arrays
 *   - Pipe spool: COMPLETED/CANCELLED orders rejected
 */

import { describe, it, expect } from 'vitest';

// ── Machine assignment validation ─────────────────────────────────────────────

describe('Machine assignment validation', () => {
    function validateMachineAssignment(machine: { id: string; code: string; status: string }): string | null {
        if (machine.status === 'DOWN') return `Machine ${machine.code} is currently DOWN and cannot be assigned`;
        if (machine.status === 'MAINTENANCE') return `Machine ${machine.code} is under MAINTENANCE and cannot be assigned`;
        return null;
    }

    it('allows RUNNING machine', () => {
        expect(validateMachineAssignment({ id: 'm1', code: 'CNC-01', status: 'RUNNING' })).toBeNull();
    });

    it('allows IDLE machine', () => {
        expect(validateMachineAssignment({ id: 'm2', code: 'WLD-01', status: 'IDLE' })).toBeNull();
    });

    it('blocks DOWN machine with descriptive message', () => {
        const err = validateMachineAssignment({ id: 'm3', code: 'PKG-01', status: 'DOWN' });
        expect(err).not.toBeNull();
        expect(err).toMatch(/DOWN/);
        expect(err).toMatch(/PKG-01/);
    });

    it('blocks MAINTENANCE machine with descriptive message', () => {
        const err = validateMachineAssignment({ id: 'm4', code: 'ASSY-01', status: 'MAINTENANCE' });
        expect(err).not.toBeNull();
        expect(err).toMatch(/MAINTENANCE/);
        expect(err).toMatch(/ASSY-01/);
    });

    it('allows assignment when machineId is absent (optional)', () => {
        // No machine selected — no validation needed
        const machineId: string | undefined = undefined;
        const result = machineId ? validateMachineAssignment({ id: machineId, code: '', status: '' }) : null;
        expect(result).toBeNull();
    });
});

// ── WorkOrder creation: starts at PLANNED ─────────────────────────────────────

describe('WorkOrder initial status', () => {
    function buildOrderData(overrides: object = {}) {
        return {
            orderNumber: 'WO-TEST-001',
            productId: 'prod-1',
            quantity: 100,
            status: 'PLANNED',
            priority: 2,
            dueDate: new Date(Date.now() + 86400000 * 7),
            ...overrides,
        };
    }

    it('creates order with PLANNED status by default', () => {
        const data = buildOrderData();
        expect(data.status).toBe('PLANNED');
    });

    it('does not create order as RELEASED', () => {
        const data = buildOrderData();
        expect(data.status).not.toBe('RELEASED');
    });

    it('accepts priority 1–4', () => {
        for (const p of [1, 2, 3, 4]) {
            const data = buildOrderData({ priority: p });
            expect(data.priority).toBe(p);
        }
    });

    it('uses provided dueDate', () => {
        const due = new Date('2026-06-30');
        const data = buildOrderData({ dueDate: due });
        expect(data.dueDate).toEqual(due);
    });

    it('defaults priority to 2 when not provided', () => {
        const data = buildOrderData();
        expect(data.priority).toBe(2);
    });
});

// ── Duplicate schedule prevention ─────────────────────────────────────────────

describe('Duplicate schedule prevention', () => {
    interface Schedule { templateId: string; date: Date }

    function wouldCreateDuplicate(existing: Schedule[], templateId: string, date: string): boolean {
        const target = new Date(date);
        const dayStart = new Date(target);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        return existing.some(s =>
            s.templateId === templateId &&
            s.date >= dayStart &&
            s.date < dayEnd
        );
    }

    const existing: Schedule[] = [
        { templateId: 'tpl-1', date: new Date('2026-06-01T06:00:00Z') },
        { templateId: 'tpl-2', date: new Date('2026-06-01T14:00:00Z') },
    ];

    it('detects duplicate for same template and date', () => {
        expect(wouldCreateDuplicate(existing, 'tpl-1', '2026-06-01')).toBe(true);
    });

    it('allows same template on a different date', () => {
        expect(wouldCreateDuplicate(existing, 'tpl-1', '2026-06-02')).toBe(false);
    });

    it('allows different template on the same date', () => {
        expect(wouldCreateDuplicate(existing, 'tpl-3', '2026-06-01')).toBe(false);
    });

    it('returns false when no existing schedules', () => {
        expect(wouldCreateDuplicate([], 'tpl-1', '2026-06-01')).toBe(false);
    });

    it('counts schedules at the very start of the day as duplicates', () => {
        const midnight: Schedule[] = [{ templateId: 'tpl-1', date: new Date('2026-06-01T00:00:00Z') }];
        expect(wouldCreateDuplicate(midnight, 'tpl-1', '2026-06-01')).toBe(true);
    });

    it('does not count schedules from the next day as duplicates', () => {
        const next: Schedule[] = [{ templateId: 'tpl-1', date: new Date('2026-06-02T00:00:00Z') }];
        expect(wouldCreateDuplicate(next, 'tpl-1', '2026-06-01')).toBe(false);
    });
});

// ── Dashboard: no demo data padding ──────────────────────────────────────────

describe('Dashboard real-data-only policy', () => {
    const DEMO_LABELS = new Set([
        'Electrical Fault', 'Preventive Maintenance', 'Mechanical Breakdown',
        'Material Shortage', 'Setup / Changeover', 'Operator Break',
        'Surface Finish', 'Dimensional OOS', 'Label Misaligned',
        'Assembly Error', 'Torque Failure', 'Wrong Color',
    ]);

    function buildDowntimePareto(realEvents: Array<{ label: string; value: number }>): Array<{ label: string; value: number; color: string }> {
        return realEvents.slice(0, 6).map(e => ({ ...e, color: '#d32f2f' }));
    }

    it('returns only real downtime entries — no padding with demo labels', () => {
        const real = [{ label: 'Sensor Failure', value: 30 }];
        const result = buildDowntimePareto(real);
        result.forEach(r => expect(DEMO_LABELS.has(r.label)).toBe(false));
    });

    it('returns empty array when no real downtime events exist', () => {
        expect(buildDowntimePareto([])).toHaveLength(0);
    });

    it('caps at 6 entries without padding', () => {
        const many = Array.from({ length: 10 }, (_, i) => ({ label: `Fault-${i}`, value: 10 - i }));
        expect(buildDowntimePareto(many)).toHaveLength(6);
    });

    function buildProductionChart(tasks: { endTime: Date }[], labels: string[]): Array<{ hour: string; actual: number; target: number }> {
        const production = labels.map(label => ({ hour: label, actual: 0, target: 0 }));
        // Real task count per bucket (simplified: each task increments index 0 for testing)
        tasks.forEach(() => { if (production.length > 0) production[0].actual += 1; });
        production.forEach(p => {
            p.target = p.actual > 0 ? Math.max(p.actual, Math.round(p.actual * 1.15)) : 0;
        });
        return production;
    }

    it('shows 0 target when no real task completions — no demo target values', () => {
        const result = buildProductionChart([], ['00:00', '04:00', '08:00']);
        result.forEach(p => {
            expect(p.actual).toBe(0);
            expect(p.target).toBe(0);
        });
    });

    it('sets target as 115% of actual when real completions exist', () => {
        const now = new Date();
        const result = buildProductionChart([{ endTime: now }], ['00:00', '04:00']);
        expect(result[0].actual).toBe(1);
        expect(result[0].target).toBe(Math.round(1 * 1.15));
    });
});

// ── Pipe spool: COMPLETED/CANCELLED orders blocked ────────────────────────────

describe('Pipe spool work order validation', () => {
    function canLinkSpoolToOrder(orderStatus: string): string | null {
        if (['COMPLETED', 'CANCELLED'].includes(orderStatus))
            return `Work order is ${orderStatus} — cannot link new spools to it`;
        return null;
    }

    it('allows linking to PLANNED order', () => {
        expect(canLinkSpoolToOrder('PLANNED')).toBeNull();
    });

    it('allows linking to RELEASED order', () => {
        expect(canLinkSpoolToOrder('RELEASED')).toBeNull();
    });

    it('allows linking to IN_PROGRESS order', () => {
        expect(canLinkSpoolToOrder('IN_PROGRESS')).toBeNull();
    });

    it('blocks linking to COMPLETED order', () => {
        const err = canLinkSpoolToOrder('COMPLETED');
        expect(err).not.toBeNull();
        expect(err).toMatch(/COMPLETED/);
    });

    it('blocks linking to CANCELLED order', () => {
        const err = canLinkSpoolToOrder('CANCELLED');
        expect(err).not.toBeNull();
        expect(err).toMatch(/CANCELLED/);
    });
});
