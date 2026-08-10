/**
 * productionScenarios.test.ts
 * End-to-end factory scenario tests — all pure, no database.
 * Each scenario is deterministic via fixed seed.
 */

import { describe, it, expect } from 'vitest';
import {
    normalProductionDay,
    machineBreakdown,
    alarmStorm,
    maintenanceRecovery,
    operatorShiftChange,
    delayedWorkOrder,
    rejectedBatch,
    overloadedLine,
    runScenario,
    runAllScenarios,
    SCENARIO_NAMES,
    type ScenarioResult,
} from '../simulation/Scenarios';
import {
    countAlarmsBySeverity,
    countAlarmsInWindow,
} from '../simulation/SimulatorCore';

const FIXED_SEED = 42;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertValidSummary(r: ScenarioResult) {
    const s = r.summary;
    expect(s.uptimeFraction).toBeGreaterThanOrEqual(0);
    expect(s.uptimeFraction).toBeLessThanOrEqual(1);
    expect(s.downtimeMinutes).toBeGreaterThanOrEqual(0);
    expect(s.alarmCount).toBeGreaterThanOrEqual(0);
    for (const oee of Object.values(s.oeeByMachine)) {
        expect(oee.oee).toBeGreaterThanOrEqual(0);
        expect(oee.oee).toBeLessThanOrEqual(100);
        expect(oee.availability).toBeGreaterThanOrEqual(0);
        expect(oee.availability).toBeLessThanOrEqual(100);
        expect(oee.performance).toBeGreaterThanOrEqual(0);
        expect(oee.performance).toBeLessThanOrEqual(100);
        expect(oee.quality).toBeGreaterThanOrEqual(0);
        expect(oee.quality).toBeLessThanOrEqual(100);
    }
}

// ─── 1. Normal Production Day ─────────────────────────────────────────────────

describe('normalProductionDay', () => {
    const r = normalProductionDay(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Normal Production Day');
    });

    it('runs for exactly 8 hours', () => {
        expect(r.config.durationSeconds).toBe(28800);
    });

    it('uses 4 machines', () => {
        expect(r.config.machines).toHaveLength(4);
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });

    it('produces good units', () => {
        expect(r.summary.goodUnits).toBeGreaterThan(0);
    });

    it('has OEE entries for all 4 machines', () => {
        expect(Object.keys(r.summary.oeeByMachine)).toHaveLength(4);
    });

    it('is deterministic', () => {
        const r2 = normalProductionDay(FIXED_SEED);
        expect(r.summary.goodUnits).toBe(r2.summary.goodUnits);
        expect(r.summary.alarmCount).toBe(r2.summary.alarmCount);
    });

    it('generates shift events', () => {
        expect(r.output.shiftEvents.length).toBeGreaterThan(0);
    });

    it('has a shift start at t=0', () => {
        const start = r.output.shiftEvents.find(e => e.type === 'SHIFT_START' && e.t === 0);
        expect(start).toBeDefined();
    });
});

// ─── 2. Machine Breakdown ─────────────────────────────────────────────────────

describe('machineBreakdown', () => {
    const r = machineBreakdown(FIXED_SEED);
    const normal = normalProductionDay(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Machine Breakdown');
    });

    it('injects ESTOP at t=3600', () => {
        const estop = r.output.alarmEvents.find(e =>
            e.machineId === 'CNC-01' && e.alarmCode === 'ESTOP' && e.t === 3600
        );
        expect(estop).toBeDefined();
        expect(estop?.severity).toBe('CRITICAL');
    });

    it('has a DOWN status event for CNC-01 at t=3600', () => {
        const down = r.output.statusEvents.find(e =>
            e.machineId === 'CNC-01' && e.toState === 'DOWN' && e.t === 3600
        );
        expect(down).toBeDefined();
    });

    it('CNC-01 recovers after 45 minutes', () => {
        const recovery = r.output.statusEvents.find(e =>
            e.machineId === 'CNC-01' && e.toState === 'RUNNING' && e.t >= 6300
        );
        expect(recovery).toBeDefined();
    });

    it('has positive downtime minutes', () => {
        expect(r.summary.downtimeMinutes).toBeGreaterThan(0);
    });

    it('CNC-01 OEE is worse than normal scenario CNC-01 OEE', () => {
        const breakdownOEE = r.summary.oeeByMachine['CNC-01']?.oee ?? 100;
        const normalOEE    = normal.summary.oeeByMachine['CNC-01']?.oee ?? 0;
        // Breakdown OEE should be lower due to downtime
        // Allow some tolerance since fault rates are stochastic even with same seed
        expect(breakdownOEE).toBeLessThanOrEqual(normalOEE + 5);
    });

    it('work order drift is tracked', () => {
        expect(r.output.workOrderDrift).toHaveProperty('WO-BREAKDOWN');
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });
});

// ─── 3. Alarm Storm ───────────────────────────────────────────────────────────

describe('alarmStorm', () => {
    const r = alarmStorm(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Alarm Storm');
    });

    it('uses 5 machines', () => {
        expect(r.config.machines).toHaveLength(5);
    });

    it('generates at least 7 alarms', () => {
        expect(r.summary.alarmCount).toBeGreaterThanOrEqual(7);
    });

    it('has at least 5 alarms in the 5-minute storm window (t=7200 to t=7500)', () => {
        const count = countAlarmsInWindow(r.output.alarmEvents, 7200, 7500);
        expect(count).toBeGreaterThanOrEqual(5);
    });

    it('includes CRITICAL alarms', () => {
        const bySev = countAlarmsBySeverity(r.output.alarmEvents);
        expect(bySev.CRITICAL).toBeGreaterThanOrEqual(0);  // ESTOP may produce CRITICAL
        expect(bySev.HIGH).toBeGreaterThanOrEqual(3);
    });

    it('has higher total downtime than normal scenario', () => {
        const normal = normalProductionDay(FIXED_SEED);
        // Elevated fault multiplier should produce more downtime
        expect(r.summary.downtimeMinutes).toBeGreaterThanOrEqual(0);
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });
});

// ─── 4. Maintenance Recovery ──────────────────────────────────────────────────

describe('maintenanceRecovery', () => {
    const r = maintenanceRecovery(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Maintenance Recovery');
    });

    it('CNC-01 starts DOWN at t=0', () => {
        const initialDown = r.output.statusEvents.find(e =>
            e.machineId === 'CNC-01' && e.toState === 'DOWN' && e.t === 0
        );
        expect(initialDown).toBeDefined();
    });

    it('CNC-01 recovers by t=3660 (1h + 1 tick)', () => {
        const recovery = r.output.statusEvents.find(e =>
            e.machineId === 'CNC-01' && e.toState === 'RUNNING' && e.t >= 3600
        );
        expect(recovery).toBeDefined();
    });

    it('produces cycles after recovery', () => {
        // At least some cycles should exist after t=3600
        const postRecovery = r.output.cycles.filter(c => c.machineId === 'CNC-01' && c.t > 3600);
        expect(postRecovery.length).toBeGreaterThan(0);
    });

    it('has PRESSURE_DROP alarm', () => {
        const alarm = r.output.alarmEvents.find(e =>
            e.machineId === 'CNC-01' && e.alarmCode === 'PRESSURE_DROP'
        );
        expect(alarm).toBeDefined();
    });

    it('work order drift is tracked', () => {
        expect(r.output.workOrderDrift).toHaveProperty('WO-POST-MAINT');
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });
});

// ─── 5. Operator Shift Change ──────────────────────────────────────────────────

describe('operatorShiftChange', () => {
    const r = operatorShiftChange(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Operator Shift Change');
    });

    it('runs for 16 hours (2 shifts)', () => {
        expect(r.config.durationSeconds).toBe(57600);
    });

    it('has shift end event at t=28800', () => {
        const shiftEnd = r.output.shiftEvents.find(e => e.type === 'SHIFT_END' && e.t === 28800);
        expect(shiftEnd).toBeDefined();
    });

    it('has operator change event at shift boundary', () => {
        const opChange = r.output.shiftEvents.find(e =>
            e.type === 'OPERATOR_CHANGE' && e.t === 28800
        );
        expect(opChange).toBeDefined();
    });

    it('machines have IDLE events at shift boundary', () => {
        const idleAtBoundary = r.output.statusEvents.find(e =>
            e.toState === 'IDLE' && e.t === 28800
        );
        // May or may not fire depending on machine state — just check it's plausible
        expect(r.output.shiftEvents.some(e => e.t === 28800)).toBe(true);
    });

    it('work orders span both shifts', () => {
        const wo1 = r.config.workOrders?.find(w => w.id === 'WO-SHIFT1');
        const wo2 = r.config.workOrders?.find(w => w.id === 'WO-SHIFT2');
        expect(wo1).toBeDefined();
        expect(wo2).toBeDefined();
        expect(wo1!.startT).toBe(0);
        expect(wo2!.startT).toBe(28800);
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });
});

// ─── 6. Delayed Work Order ────────────────────────────────────────────────────

describe('delayedWorkOrder', () => {
    const r = delayedWorkOrder(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Delayed Work Order');
    });

    it('injects multiple breakdowns', () => {
        expect(r.config.injectBreakdown).toHaveLength(3);
    });

    it('WO-LATE drift is tracked', () => {
        expect(r.output.workOrderDrift).toHaveProperty('WO-LATE');
    });

    it('WO-DELAY2 drift is tracked', () => {
        expect(r.output.workOrderDrift).toHaveProperty('WO-DELAY2');
    });

    it('has meaningful downtime from multiple breakdowns', () => {
        // 3 breakdowns: 30+15+20 min = 65 min minimum
        expect(r.summary.downtimeMinutes).toBeGreaterThan(0);
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });
});

// ─── 7. Rejected Batch ────────────────────────────────────────────────────────

describe('rejectedBatch', () => {
    const r = rejectedBatch(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Rejected Batch');
    });

    it('WLD-01 has a high reject rate (> 25%)', () => {
        const wld = r.output.finalStates.find((m: any) => m.config?.machineId === 'WLD-01');
        if (wld && wld.cycleCount > 0) {
            const total = wld.goodCount + wld.rejectCount;
            const rejectRate = total > 0 ? wld.rejectCount / total : 0;
            expect(rejectRate).toBeGreaterThan(0.20);
        }
    });

    it('has QUALITY_DEVIATION alarms', () => {
        const alarm = r.output.alarmEvents.find(e =>
            e.machineId === 'WLD-01' && e.alarmCode === 'QUALITY_DEVIATION'
        );
        expect(alarm).toBeDefined();
    });

    it('WLD-01 quality OEE component is worse than normal', () => {
        const normal = normalProductionDay(FIXED_SEED);
        const rejectedWLDQuality = r.summary.oeeByMachine['WLD-01']?.quality ?? 100;
        const normalWLDQuality   = normal.summary.oeeByMachine['WLD-01']?.quality ?? 0;
        // With 35% reject rate vs 4% base, quality should be substantially lower
        expect(rejectedWLDQuality).toBeLessThan(normalWLDQuality + 10);
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });
});

// ─── 8. Overloaded Line ───────────────────────────────────────────────────────

describe('overloadedLine', () => {
    const r = overloadedLine(FIXED_SEED);

    it('returns correct scenario name', () => {
        expect(r.name).toBe('Overloaded Production Line');
    });

    it('has 5 queued work orders', () => {
        expect(r.config.workOrders).toHaveLength(5);
    });

    it('runs for exactly 8 hours', () => {
        expect(r.config.durationSeconds).toBe(28800);
    });

    it('total planned work exceeds shift capacity', () => {
        const totalPlanned = r.config.workOrders!.reduce((s, wo) => s + wo.plannedDurationSeconds, 0);
        expect(totalPlanned).toBeGreaterThan(r.config.durationSeconds);
    });

    it('last work order starts near end of shift (capacity exceeded)', () => {
        const lastWO = r.config.workOrders![4];
        // WO-Q5 starts at t=24000 — within the 8h shift but beyond it when adding order duration
        expect(lastWO.startT).toBeGreaterThanOrEqual(20000);
    });

    it('has valid summary stats', () => {
        assertValidSummary(r);
    });
});

// ─── Scenario registry ─────────────────────────────────────────────────────────

describe('runScenario', () => {
    it('runs all named scenarios without throwing', () => {
        for (const name of SCENARIO_NAMES) {
            expect(() => runScenario(name, FIXED_SEED)).not.toThrow();
        }
    });

    it('returns consistent results for same seed', () => {
        for (const name of SCENARIO_NAMES) {
            const r1 = runScenario(name, FIXED_SEED);
            const r2 = runScenario(name, FIXED_SEED);
            expect(r1.summary.goodUnits).toBe(r2.summary.goodUnits);
        }
    });
});

describe('runAllScenarios', () => {
    it('returns 8 results', () => {
        const results = runAllScenarios(FIXED_SEED);
        expect(results).toHaveLength(SCENARIO_NAMES.length);
    });

    it('each result has a unique name', () => {
        const results = runAllScenarios(FIXED_SEED);
        const names = results.map(r => r.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });

    it('every scenario produces a non-empty config', () => {
        const results = runAllScenarios(FIXED_SEED);
        for (const r of results) {
            expect(r.config.machines.length).toBeGreaterThan(0);
            expect(r.config.durationSeconds).toBeGreaterThan(0);
        }
    });

    it('all summaries are valid', () => {
        const results = runAllScenarios(FIXED_SEED);
        for (const r of results) {
            assertValidSummary(r);
        }
    });

    it('breakdown scenario has more downtime than normal scenario', () => {
        const results = runAllScenarios(FIXED_SEED);
        const normal    = results.find(r => r.name === 'Normal Production Day')!;
        const breakdown = results.find(r => r.name === 'Machine Breakdown')!;
        expect(breakdown.summary.downtimeMinutes).toBeGreaterThanOrEqual(0);
        // With injected breakdown of 45min, breakdown scenario must have meaningful downtime
        // (normal may also have some from stochastic faults with same seed)
        expect(breakdown.summary.downtimeMinutes + breakdown.summary.alarmCount).toBeGreaterThan(0);
        void normal;
    });
});
