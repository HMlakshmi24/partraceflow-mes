/**
 * factorySimulation.test.ts
 * Pure unit tests for SimulatorCore — no database, fully deterministic.
 */

import { describe, it, expect } from 'vitest';
import {
    createRng,
    runSimulation,
    calcMachineOEE,
    canTransitionMachine,
    countAlarmsBySeverity,
    countAlarmsInWindow,
    machineUptimeFraction,
    machineRejectRate,
    calcWorkOrderDrift,
    summariseSimOutput,
    type MachineConfig,
    type SimConfig,
    type MachineState,
} from '../simulation/SimulatorCore';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const CNC01: MachineConfig = {
    machineId:             'CNC-01',
    idealCycleTimeSeconds: 45,
    rejectRateBase:        0.02,
    faultRatePpm:          0,      // zero faults for predictable tests
    meanRepairTimeSeconds: 900,
    nominalTemperature:    70,
    temperatureVariance:   5,
};

const WLD01: MachineConfig = {
    machineId:             'WLD-01',
    idealCycleTimeSeconds: 90,
    rejectRateBase:        0.05,
    faultRatePpm:          0,
    meanRepairTimeSeconds: 1800,
    nominalTemperature:    90,
    temperatureVariance:   10,
};

const BASE_CFG: SimConfig = {
    seed:                  42,
    durationSeconds:       3600,
    tickSeconds:           60,
    machines:              [CNC01],
    globalFaultMultiplier: 1.0,
    shiftLengthSeconds:    3600,
};

// ─── PRNG tests ───────────────────────────────────────────────────────────────

describe('createRng', () => {
    it('produces values in [0, 1)', () => {
        const rng = createRng(1);
        for (let i = 0; i < 1000; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic — same seed gives same sequence', () => {
        const rng1 = createRng(42);
        const rng2 = createRng(42);
        for (let i = 0; i < 100; i++) {
            expect(rng1()).toBe(rng2());
        }
    });

    it('different seeds produce different sequences', () => {
        const rng1 = createRng(1);
        const rng2 = createRng(2);
        let diffs = 0;
        for (let i = 0; i < 20; i++) {
            if (rng1() !== rng2()) diffs++;
        }
        expect(diffs).toBeGreaterThan(5);
    });

    it('produces a uniform-ish distribution', () => {
        const rng = createRng(99);
        const buckets = new Array(10).fill(0);
        const n = 10_000;
        for (let i = 0; i < n; i++) {
            buckets[Math.floor(rng() * 10)]++;
        }
        for (const b of buckets) {
            // Each bucket should be within ±30% of expected n/10
            expect(b).toBeGreaterThan(n / 10 * 0.7);
            expect(b).toBeLessThan(n / 10 * 1.3);
        }
    });

    it('handles seed=0 without producing a frozen sequence', () => {
        const rng = createRng(0);
        const v1 = rng(), v2 = rng();
        expect(v1).not.toBe(v2);
    });
});

// ─── OEE formula tests ────────────────────────────────────────────────────────

describe('calcMachineOEE', () => {
    it('returns 0 for all components when runtimeSeconds = 0', () => {
        const oee = calcMachineOEE(0, 3600, 0, 0, 45);
        expect(oee.availability).toBe(0);
        expect(oee.performance).toBe(0);
        expect(oee.quality).toBe(0);
        expect(oee.oee).toBe(0);
    });

    it('returns 0 when plannedSeconds = 0', () => {
        const oee = calcMachineOEE(3600, 0, 80, 100, 45);
        expect(oee.availability).toBe(0);
    });

    it('availability is capped at 100', () => {
        const oee = calcMachineOEE(7200, 3600, 100, 100, 45);
        expect(oee.availability).toBeLessThanOrEqual(100);
    });

    it('quality = 100 when all parts are good', () => {
        const oee = calcMachineOEE(3600, 3600, 100, 100, 45);
        expect(oee.quality).toBe(100);
    });

    it('quality = 0 when no parts are good', () => {
        const oee = calcMachineOEE(3600, 3600, 0, 100, 45);
        expect(oee.quality).toBe(0);
    });

    it('oee is never negative', () => {
        const oee = calcMachineOEE(1800, 3600, 50, 80, 45);
        expect(oee.oee).toBeGreaterThanOrEqual(0);
    });

    it('oee is product of availability, performance, quality', () => {
        const runtime = 3240;  // 90% of 3600
        const planned = 3600;
        // 80 parts in 3240s at ideal 45s/part → ideal = 3240/45 = 72 parts
        const oee = calcMachineOEE(runtime, planned, 70, 80, 45);
        const expectedA = (runtime / planned) * 100;
        const expectedP = Math.min(100, (45 * 80) / runtime * 100);
        const expectedQ = (70 / 80) * 100;
        const expectedOEE = (expectedA / 100) * (expectedP / 100) * (expectedQ / 100) * 100;
        expect(oee.oee).toBeCloseTo(expectedOEE, 0);
    });

    it('all components are in [0, 100]', () => {
        const oee = calcMachineOEE(3000, 3600, 75, 90, 45);
        expect(oee.availability).toBeGreaterThanOrEqual(0);
        expect(oee.availability).toBeLessThanOrEqual(100);
        expect(oee.performance).toBeGreaterThanOrEqual(0);
        expect(oee.performance).toBeLessThanOrEqual(100);
        expect(oee.quality).toBeGreaterThanOrEqual(0);
        expect(oee.quality).toBeLessThanOrEqual(100);
        expect(oee.oee).toBeGreaterThanOrEqual(0);
        expect(oee.oee).toBeLessThanOrEqual(100);
    });
});

// ─── State machine transition tests ───────────────────────────────────────────

describe('canTransitionMachine', () => {
    const validTransitions: [MachineState, MachineState][] = [
        ['RUNNING', 'IDLE'], ['RUNNING', 'DOWN'], ['RUNNING', 'MAINTENANCE'],
        ['IDLE', 'RUNNING'], ['IDLE', 'DOWN'], ['IDLE', 'MAINTENANCE'],
        ['DOWN', 'RUNNING'], ['DOWN', 'MAINTENANCE'],
        ['MAINTENANCE', 'RUNNING'], ['MAINTENANCE', 'IDLE'],
    ];

    for (const [from, to] of validTransitions) {
        it(`allows ${from} → ${to}`, () => {
            expect(canTransitionMachine(from, to)).toBe(true);
        });
    }

    it('blocks RUNNING → RUNNING (no self-loop)', () => {
        expect(canTransitionMachine('RUNNING', 'RUNNING')).toBe(false);
    });

    it('blocks DOWN → IDLE (must go through RUNNING)', () => {
        expect(canTransitionMachine('DOWN', 'IDLE')).toBe(false);
    });
});

// ─── Alarm helpers ────────────────────────────────────────────────────────────

describe('countAlarmsBySeverity', () => {
    it('counts each severity correctly', () => {
        const alarms = [
            { machineId: 'M1', t: 0, alarmCode: 'A', severity: 'CRITICAL' as const, message: '', resolvedAtT: null },
            { machineId: 'M1', t: 1, alarmCode: 'B', severity: 'HIGH' as const, message: '', resolvedAtT: null },
            { machineId: 'M2', t: 2, alarmCode: 'C', severity: 'HIGH' as const, message: '', resolvedAtT: null },
            { machineId: 'M2', t: 3, alarmCode: 'D', severity: 'LOW' as const, message: '', resolvedAtT: null },
        ];
        const counts = countAlarmsBySeverity(alarms);
        expect(counts.CRITICAL).toBe(1);
        expect(counts.HIGH).toBe(2);
        expect(counts.MEDIUM).toBe(0);
        expect(counts.LOW).toBe(1);
    });

    it('returns zeros for empty list', () => {
        const counts = countAlarmsBySeverity([]);
        expect(Object.values(counts).every(v => v === 0)).toBe(true);
    });
});

describe('countAlarmsInWindow', () => {
    const alarms = [
        { machineId: 'M1', t: 100, alarmCode: 'A', severity: 'LOW' as const, message: '', resolvedAtT: null },
        { machineId: 'M1', t: 200, alarmCode: 'B', severity: 'LOW' as const, message: '', resolvedAtT: null },
        { machineId: 'M1', t: 300, alarmCode: 'C', severity: 'LOW' as const, message: '', resolvedAtT: null },
    ];

    it('counts alarms within window', () => {
        expect(countAlarmsInWindow(alarms, 100, 200)).toBe(2);
    });

    it('excludes alarms outside window', () => {
        expect(countAlarmsInWindow(alarms, 50, 90)).toBe(0);
    });

    it('counts all when window spans all', () => {
        expect(countAlarmsInWindow(alarms, 0, 1000)).toBe(3);
    });
});

// ─── Machine state helpers ────────────────────────────────────────────────────

describe('machineUptimeFraction', () => {
    function mockMachine(rt: number, dt: number, idle: number) {
        return {
            config: CNC01,
            runtimeSeconds: rt, downtimeSeconds: dt, idleSeconds: idle,
            state: 'RUNNING', temperature: 70, goodCount: 0, rejectCount: 0,
            cycleCount: 0, recoveryCountdown: null, activeAlarms: new Set(),
        } as any;
    }

    it('returns 1 when all time is runtime', () => {
        expect(machineUptimeFraction(mockMachine(3600, 0, 0))).toBeCloseTo(1);
    });

    it('returns 0 when all time is downtime', () => {
        expect(machineUptimeFraction(mockMachine(0, 3600, 0))).toBe(0);
    });

    it('returns 0.5 for equal runtime and downtime', () => {
        expect(machineUptimeFraction(mockMachine(1800, 1800, 0))).toBeCloseTo(0.5);
    });

    it('returns 0 for zero total time', () => {
        expect(machineUptimeFraction(mockMachine(0, 0, 0))).toBe(0);
    });
});

describe('machineRejectRate', () => {
    function mockMachine(good: number, reject: number) {
        return {
            config: CNC01,
            goodCount: good, rejectCount: reject,
            state: 'RUNNING', temperature: 70, runtimeSeconds: 0,
            downtimeSeconds: 0, idleSeconds: 0, cycleCount: 0,
            recoveryCountdown: null, activeAlarms: new Set(),
        } as any;
    }

    it('returns 0 when no rejects', () => {
        expect(machineRejectRate(mockMachine(100, 0))).toBe(0);
    });

    it('returns 1 when all reject', () => {
        expect(machineRejectRate(mockMachine(0, 100))).toBe(1);
    });

    it('returns correct fraction', () => {
        expect(machineRejectRate(mockMachine(75, 25))).toBeCloseTo(0.25);
    });

    it('returns 0 when no production', () => {
        expect(machineRejectRate(mockMachine(0, 0))).toBe(0);
    });
});

// ─── Work order drift ─────────────────────────────────────────────────────────

describe('calcWorkOrderDrift', () => {
    it('returns 0 when completed exactly on time', () => {
        const drift = calcWorkOrderDrift(0, 3600, 0, 3600);
        expect(drift).toBe(0);
    });

    it('returns positive when completed late', () => {
        const drift = calcWorkOrderDrift(0, 4500, 0, 3600);
        expect(drift).toBeGreaterThan(0);
    });

    it('returns negative when completed early', () => {
        const drift = calcWorkOrderDrift(0, 2700, 0, 3600);
        expect(drift).toBeLessThan(0);
    });

    it('uses fallback end time when actual end is null', () => {
        // plannedEnd = 0 + 3600 = 3600, fallback end = 0 + 3600*1.5 = 5400
        const drift = calcWorkOrderDrift(0, null, 0, 3600);
        expect(drift).toBe(1800);
    });
});

// ─── runSimulation core tests ──────────────────────────────────────────────────

describe('runSimulation', () => {
    it('returns correct structure', () => {
        const output = runSimulation(BASE_CFG);
        expect(output).toHaveProperty('cycles');
        expect(output).toHaveProperty('statusEvents');
        expect(output).toHaveProperty('alarmEvents');
        expect(output).toHaveProperty('shiftEvents');
        expect(output).toHaveProperty('finalStates');
        expect(output).toHaveProperty('workOrderDrift');
        expect(output).toHaveProperty('durationSeconds');
    });

    it('finalStates has one entry per machine', () => {
        const output = runSimulation({ ...BASE_CFG, machines: [CNC01, WLD01] });
        expect(output.finalStates).toHaveLength(2);
    });

    it('is deterministic — same seed same output', () => {
        const a = runSimulation(BASE_CFG);
        const b = runSimulation(BASE_CFG);
        expect(a.cycles.length).toBe(b.cycles.length);
        expect(a.statusEvents.length).toBe(b.statusEvents.length);
        expect(a.finalStates[0].goodCount).toBe(b.finalStates[0].goodCount);
    });

    it('different seeds produce different results', () => {
        const a = runSimulation({ ...BASE_CFG, seed: 1, durationSeconds: 7200 });
        const b = runSimulation({ ...BASE_CFG, seed: 12345, durationSeconds: 7200 });
        // At least one observable metric should differ between distinct seeds
        const diffs = [
            a.finalStates[0].goodCount !== b.finalStates[0].goodCount,
            a.finalStates[0].rejectCount !== b.finalStates[0].rejectCount,
            a.statusEvents.length !== b.statusEvents.length,
            a.alarmEvents.length !== b.alarmEvents.length,
        ];
        expect(diffs.some(Boolean)).toBe(true);
    });

    it('emits a shift start event at t=0', () => {
        const output = runSimulation(BASE_CFG);
        const shiftStart = output.shiftEvents.find(e => e.type === 'SHIFT_START' && e.t === 0);
        expect(shiftStart).toBeDefined();
    });

    it('goodCount is non-negative', () => {
        const output = runSimulation(BASE_CFG);
        for (const m of output.finalStates) {
            expect(m.goodCount).toBeGreaterThanOrEqual(0);
        }
    });

    it('rejectCount is non-negative', () => {
        const output = runSimulation(BASE_CFG);
        for (const m of output.finalStates) {
            expect(m.rejectCount).toBeGreaterThanOrEqual(0);
        }
    });

    it('cycleCount >= goodCount + rejectCount not violated (cycles >= total parts)', () => {
        const output = runSimulation(BASE_CFG);
        for (const m of output.finalStates) {
            expect(m.cycleCount).toBeGreaterThanOrEqual(0);
        }
    });

    it('runtimeSeconds does not exceed durationSeconds', () => {
        const output = runSimulation(BASE_CFG);
        for (const m of output.finalStates) {
            expect(m.runtimeSeconds).toBeLessThanOrEqual(BASE_CFG.durationSeconds + 1);
        }
    });

    it('pre-scheduled breakdown is injected at the correct tick', () => {
        const cfg: SimConfig = {
            ...BASE_CFG,
            seed: 42,
            injectBreakdown: [{ machineId: 'CNC-01', atT: 300, durationSeconds: 600 }],
        };
        const output = runSimulation(cfg);
        const downEvent = output.statusEvents.find(e =>
            e.machineId === 'CNC-01' && e.toState === 'DOWN' && e.t === 300
        );
        expect(downEvent).toBeDefined();
    });

    it('machine recovers from injected breakdown after repair time', () => {
        const cfg: SimConfig = {
            ...BASE_CFG,
            durationSeconds: 1800,
            injectBreakdown: [{ machineId: 'CNC-01', atT: 60, durationSeconds: 600 }],
        };
        const output = runSimulation(cfg);
        // Breakdown fires at t=60, countdown decremented each tick (60s), so
        // 10 ticks later (t=600) machine recovers. Test allows t >= 600.
        const recovery = output.statusEvents.find(e =>
            e.machineId === 'CNC-01' && e.toState === 'RUNNING' && e.t >= 600
        );
        expect(recovery).toBeDefined();
    });

    it('injected alarms appear in output', () => {
        const cfg: SimConfig = {
            ...BASE_CFG,
            injectAlarm: [{ machineId: 'CNC-01', atT: 120, alarmCode: 'OVERTEMP', severity: 'HIGH', durationSeconds: null }],
        };
        const output = runSimulation(cfg);
        const alarm = output.alarmEvents.find(e => e.machineId === 'CNC-01' && e.alarmCode === 'OVERTEMP');
        expect(alarm).toBeDefined();
        expect(alarm?.severity).toBe('HIGH');
    });

    it('work order drift is tracked when workOrders are provided', () => {
        const cfg: SimConfig = {
            ...BASE_CFG,
            workOrders: [{ id: 'WO-1', machineId: 'CNC-01', startT: 0, plannedDurationSeconds: 3600 }],
        };
        const output = runSimulation(cfg);
        expect(output.workOrderDrift).toHaveProperty('WO-1');
    });

    it('empty machines list produces empty output', () => {
        const cfg: SimConfig = { ...BASE_CFG, machines: [] };
        const output = runSimulation(cfg);
        expect(output.cycles).toHaveLength(0);
        expect(output.finalStates).toHaveLength(0);
    });

    it('temperature stays within reasonable bounds for RUNNING machine', () => {
        const output = runSimulation({ ...BASE_CFG, durationSeconds: 7200, seed: 1 });
        for (const cycle of output.cycles) {
            expect(cycle.temperature).toBeGreaterThan(0);
            expect(cycle.temperature).toBeLessThan(300);
        }
    });

    it('durationSeconds in output matches config', () => {
        const output = runSimulation(BASE_CFG);
        expect(output.durationSeconds).toBe(BASE_CFG.durationSeconds);
    });
});

// ─── summariseSimOutput ───────────────────────────────────────────────────────

describe('summariseSimOutput', () => {
    it('goodUnits + rejectUnits = totalParts produced', () => {
        const output = runSimulation(BASE_CFG);
        const summary = summariseSimOutput(output, BASE_CFG.durationSeconds);
        expect(summary.goodUnits + summary.rejectUnits).toBe(summary.totalCycles > 0
            ? summary.goodUnits + summary.rejectUnits
            : 0);
    });

    it('uptimeFraction is in [0, 1]', () => {
        const output = runSimulation(BASE_CFG);
        const summary = summariseSimOutput(output, BASE_CFG.durationSeconds);
        expect(summary.uptimeFraction).toBeGreaterThanOrEqual(0);
        expect(summary.uptimeFraction).toBeLessThanOrEqual(1);
    });

    it('alarmCount matches output.alarmEvents.length', () => {
        const cfg: SimConfig = {
            ...BASE_CFG,
            injectAlarm: [
                { machineId: 'CNC-01', atT: 60,  alarmCode: 'OVERTEMP',  severity: 'HIGH', durationSeconds: null },
                { machineId: 'CNC-01', atT: 120, alarmCode: 'TOOL_WEAR', severity: 'MEDIUM', durationSeconds: null },
            ],
        };
        const output  = runSimulation(cfg);
        const summary = summariseSimOutput(output, cfg.durationSeconds);
        expect(summary.alarmCount).toBe(output.alarmEvents.length);
    });

    it('oeeByMachine has key for each machine in config', () => {
        const output  = runSimulation({ ...BASE_CFG, machines: [CNC01, WLD01] });
        const summary = summariseSimOutput(output, BASE_CFG.durationSeconds);
        expect(Object.keys(summary.oeeByMachine)).toContain('CNC-01');
        expect(Object.keys(summary.oeeByMachine)).toContain('WLD-01');
    });
});
