/**
 * Factory production scenarios — pre-configured SimConfig presets.
 * Pure functions; no DB access. Each scenario is deterministic by seed.
 */

import {
    runSimulation,
    summariseSimOutput,
    type MachineConfig,
    type SimConfig,
    type SimOutput,
    type ScenarioSummary,
} from './SimulatorCore';

// ─── Shared machine catalogue ──────────────────────────────────────────────────

const CNC01: MachineConfig = {
    machineId:             'CNC-01',
    idealCycleTimeSeconds: 45,
    rejectRateBase:        0.02,
    faultRatePpm:          400,
    meanRepairTimeSeconds: 1800,
    nominalTemperature:    72,
    temperatureVariance:   8,
};

const CNC02: MachineConfig = {
    machineId:             'CNC-02',
    idealCycleTimeSeconds: 48,
    rejectRateBase:        0.025,
    faultRatePpm:          350,
    meanRepairTimeSeconds: 1800,
    nominalTemperature:    70,
    temperatureVariance:   8,
};

const WLD01: MachineConfig = {
    machineId:             'WLD-01',
    idealCycleTimeSeconds: 90,
    rejectRateBase:        0.04,
    faultRatePpm:          600,
    meanRepairTimeSeconds: 2400,
    nominalTemperature:    95,
    temperatureVariance:   15,
};

const ASSY01: MachineConfig = {
    machineId:             'ASSY-01',
    idealCycleTimeSeconds: 120,
    rejectRateBase:        0.01,
    faultRatePpm:          200,
    meanRepairTimeSeconds: 900,
    nominalTemperature:    55,
    temperatureVariance:   5,
};

const QCGATE: MachineConfig = {
    machineId:             'QC-GATE',
    idealCycleTimeSeconds: 30,
    rejectRateBase:        0.0,  // QC gate detects but doesn't produce rejects itself
    faultRatePpm:          100,
    meanRepairTimeSeconds: 600,
    nominalTemperature:    45,
    temperatureVariance:   3,
};

const SHIFT_8H = 8 * 3600;
const SHIFT_DAY = 28800;

export interface ScenarioResult {
    name:        string;
    description: string;
    config:      SimConfig;
    output:      SimOutput;
    summary:     ScenarioSummary;
}

function buildResult(name: string, description: string, config: SimConfig): ScenarioResult {
    const output  = runSimulation(config);
    const summary = summariseSimOutput(output, config.durationSeconds);
    return { name, description, config, output, summary };
}

// ─── 1. Normal Production Day ─────────────────────────────────────────────────

export function normalProductionDay(seed = 42): ScenarioResult {
    const config: SimConfig = {
        seed,
        durationSeconds:       SHIFT_DAY,
        tickSeconds:           60,
        machines:              [CNC01, CNC02, WLD01, ASSY01],
        globalFaultMultiplier: 1.0,
        shiftLengthSeconds:    SHIFT_8H,
        operators:             ['Ramesh.Kumar', 'Priya.Nair', 'Ravi.Shankar'],
        workOrders: [
            { id: 'WO-001', machineId: 'CNC-01', startT: 0,    plannedDurationSeconds: 7200 },
            { id: 'WO-002', machineId: 'WLD-01', startT: 3600, plannedDurationSeconds: 5400 },
        ],
    };
    return buildResult(
        'Normal Production Day',
        'Standard 8-hour shift with 4 machines running at nominal conditions. Baseline OEE reference.',
        config,
    );
}

// ─── 2. Machine Breakdown ─────────────────────────────────────────────────────

export function machineBreakdown(seed = 42): ScenarioResult {
    const config: SimConfig = {
        seed,
        durationSeconds:       SHIFT_DAY,
        tickSeconds:           60,
        machines:              [CNC01, WLD01, ASSY01],
        globalFaultMultiplier: 1.0,
        shiftLengthSeconds:    SHIFT_8H,
        injectBreakdown: [
            { machineId: 'CNC-01', atT: 3600,  durationSeconds: 2700 },   // 45-min breakdown at hour 1
        ],
        injectAlarm: [
            { machineId: 'CNC-01', atT: 3600, alarmCode: 'ESTOP',         severity: 'CRITICAL', durationSeconds: 2700 },
            { machineId: 'CNC-01', atT: 3660, alarmCode: 'SPINDLE_OVERLOAD', severity: 'HIGH', durationSeconds: 2640 },
        ],
        workOrders: [
            { id: 'WO-BREAKDOWN', machineId: 'CNC-01', startT: 0, plannedDurationSeconds: 7200 },
        ],
    };
    return buildResult(
        'Machine Breakdown',
        'CNC-01 suffers an emergency stop at t=1h with 45-minute repair. Demonstrates OEE impact and schedule drift.',
        config,
    );
}

// ─── 3. Alarm Storm ───────────────────────────────────────────────────────────

export function alarmStorm(seed = 42): ScenarioResult {
    const config: SimConfig = {
        seed,
        durationSeconds:       SHIFT_DAY,
        tickSeconds:           60,
        machines:              [CNC01, CNC02, WLD01, ASSY01, QCGATE],
        globalFaultMultiplier: 3.5,  // greatly elevated fault rate
        shiftLengthSeconds:    SHIFT_8H,
        injectAlarm: [
            // Cascade of alarms starting at t=7200 (2h into shift)
            { machineId: 'CNC-01',  atT: 7200,  alarmCode: 'OVERTEMP',          severity: 'HIGH',     durationSeconds: 900 },
            { machineId: 'CNC-02',  atT: 7260,  alarmCode: 'VIBRATION_HIGH',     severity: 'HIGH',     durationSeconds: 600 },
            { machineId: 'WLD-01',  atT: 7320,  alarmCode: 'COOLANT_LOW',        severity: 'MEDIUM',   durationSeconds: 1200 },
            { machineId: 'ASSY-01', atT: 7380,  alarmCode: 'FEED_JAM',           severity: 'HIGH',     durationSeconds: 480 },
            { machineId: 'QC-GATE', atT: 7440,  alarmCode: 'QUALITY_DEVIATION',  severity: 'MEDIUM',   durationSeconds: 600 },
            { machineId: 'CNC-01',  atT: 7500,  alarmCode: 'SPINDLE_OVERLOAD',   severity: 'HIGH',     durationSeconds: 600 },
            { machineId: 'CNC-02',  atT: 7500,  alarmCode: 'TOOL_WEAR',          severity: 'MEDIUM',   durationSeconds: 1800 },
        ],
        injectBreakdown: [
            { machineId: 'CNC-01', atT: 7200, durationSeconds: 1800 },
            { machineId: 'CNC-02', atT: 7260, durationSeconds: 1200 },
        ],
    };
    return buildResult(
        'Alarm Storm',
        'Multiple simultaneous alarms cascade across 5 machines within a 5-minute window. Tests alarm processing and dashboard update stability.',
        config,
    );
}

// ─── 4. Maintenance Recovery ──────────────────────────────────────────────────

export function maintenanceRecovery(seed = 42): ScenarioResult {
    const config: SimConfig = {
        seed,
        durationSeconds:       SHIFT_DAY,
        tickSeconds:           60,
        machines:              [CNC01, WLD01],
        globalFaultMultiplier: 0.5,  // lower fault rate post-maintenance
        shiftLengthSeconds:    SHIFT_8H,
        injectBreakdown: [
            { machineId: 'CNC-01', atT: 0, durationSeconds: 3600 },  // planned maintenance at shift start
        ],
        injectAlarm: [
            { machineId: 'CNC-01', atT: 0, alarmCode: 'PRESSURE_DROP', severity: 'MEDIUM', durationSeconds: 3600 },
        ],
        workOrders: [
            { id: 'WO-POST-MAINT', machineId: 'CNC-01', startT: 3600, plannedDurationSeconds: 14400 },
        ],
    };
    return buildResult(
        'Maintenance Recovery',
        'CNC-01 enters planned maintenance at shift start, recovers at t=1h, then runs with reduced fault rate for remaining 7h.',
        config,
    );
}

// ─── 5. Operator Shift Change ──────────────────────────────────────────────────

export function operatorShiftChange(seed = 42): ScenarioResult {
    // Two full shifts = 16h
    const config: SimConfig = {
        seed,
        durationSeconds:       2 * SHIFT_8H,
        tickSeconds:           60,
        machines:              [CNC01, ASSY01],
        globalFaultMultiplier: 1.0,
        shiftLengthSeconds:    SHIFT_8H,
        operators:             ['Ramesh.Kumar', 'Priya.Nair', 'Ravi.Shankar', 'Anil.Verma'],
        workOrders: [
            { id: 'WO-SHIFT1', machineId: 'CNC-01',  startT: 0,       plannedDurationSeconds: SHIFT_8H },
            { id: 'WO-SHIFT2', machineId: 'ASSY-01', startT: SHIFT_8H, plannedDurationSeconds: SHIFT_8H },
        ],
    };
    return buildResult(
        'Operator Shift Change',
        'Two consecutive 8-hour shifts with operator handover. IDLE gap at shift boundary should be visible in OEE.',
        config,
    );
}

// ─── 6. Delayed Work Order ───────────────────────────────────────────────────

export function delayedWorkOrder(seed = 42): ScenarioResult {
    const config: SimConfig = {
        seed,
        durationSeconds:       SHIFT_DAY,
        tickSeconds:           60,
        machines:              [CNC01, WLD01],
        globalFaultMultiplier: 2.0,   // elevated faults cause delays
        shiftLengthSeconds:    SHIFT_8H,
        injectBreakdown: [
            { machineId: 'CNC-01', atT: 1800,  durationSeconds: 1800 },  // t=30min, 30min repair
            { machineId: 'CNC-01', atT: 10800, durationSeconds: 900 },   // t=3h, 15min repair
            { machineId: 'WLD-01', atT: 7200,  durationSeconds: 1200 },  // t=2h, 20min repair
        ],
        workOrders: [
            { id: 'WO-LATE',   machineId: 'CNC-01', startT: 0,    plannedDurationSeconds: 14400 },
            { id: 'WO-DELAY2', machineId: 'WLD-01', startT: 3600, plannedDurationSeconds: 10800 },
        ],
    };
    return buildResult(
        'Delayed Work Order',
        'Multiple breakdowns push work orders past their planned completion time. Schedule drift should be positive.',
        config,
    );
}

// ─── 7. Rejected Batch ──────────────────────────────────────────────────────

export function rejectedBatch(seed = 42): ScenarioResult {
    // Create a high-reject variant of WLD-01
    const highRejectWLD: MachineConfig = {
        ...WLD01,
        rejectRateBase: 0.35,   // 35% reject rate — batch problem
        faultRatePpm:   200,
    };
    const config: SimConfig = {
        seed,
        durationSeconds:       SHIFT_DAY,
        tickSeconds:           60,
        machines:              [CNC01, highRejectWLD, ASSY01],
        globalFaultMultiplier: 1.0,
        shiftLengthSeconds:    SHIFT_8H,
        injectAlarm: [
            { machineId: 'WLD-01', atT: 3600, alarmCode: 'QUALITY_DEVIATION', severity: 'HIGH', durationSeconds: null },
            { machineId: 'WLD-01', atT: 7200, alarmCode: 'QUALITY_DEVIATION', severity: 'HIGH', durationSeconds: null },
        ],
        workOrders: [
            { id: 'WO-REWORK', machineId: 'WLD-01', startT: 0, plannedDurationSeconds: 10800 },
        ],
    };
    return buildResult(
        'Rejected Batch',
        'WLD-01 experiences 35% reject rate requiring rework. Quality pass rate degrades significantly.',
        config,
    );
}

// ─── 8. Overloaded Production Line ──────────────────────────────────────────

export function overloadedLine(seed = 42): ScenarioResult {
    // One machine, 5 queued work orders that together exceed shift capacity
    const config: SimConfig = {
        seed,
        durationSeconds:       SHIFT_DAY,
        tickSeconds:           60,
        machines:              [CNC01],
        globalFaultMultiplier: 1.2,
        shiftLengthSeconds:    SHIFT_8H,
        workOrders: [
            { id: 'WO-Q1', machineId: 'CNC-01', startT: 0,    plannedDurationSeconds: 6000  },
            { id: 'WO-Q2', machineId: 'CNC-01', startT: 6000, plannedDurationSeconds: 6000  },
            { id: 'WO-Q3', machineId: 'CNC-01', startT: 12000, plannedDurationSeconds: 6000 },
            { id: 'WO-Q4', machineId: 'CNC-01', startT: 18000, plannedDurationSeconds: 6000 },
            { id: 'WO-Q5', machineId: 'CNC-01', startT: 24000, plannedDurationSeconds: 6000 }, // 5×6000=30000 > 28800 → overloaded
        ],
    };
    return buildResult(
        'Overloaded Production Line',
        '5 work orders queued on CNC-01 totalling 8.3h — exceeds the 8h shift capacity.',
        config,
    );
}

// ─── Scenario registry ─────────────────────────────────────────────────────────

export const SCENARIO_NAMES = [
    'normal',
    'breakdown',
    'alarm-storm',
    'maintenance',
    'shift-change',
    'delayed',
    'rejected-batch',
    'overloaded',
] as const;

export type ScenarioName = typeof SCENARIO_NAMES[number];

export function runScenario(name: ScenarioName, seed = 42): ScenarioResult {
    switch (name) {
        case 'normal':         return normalProductionDay(seed);
        case 'breakdown':      return machineBreakdown(seed);
        case 'alarm-storm':    return alarmStorm(seed);
        case 'maintenance':    return maintenanceRecovery(seed);
        case 'shift-change':   return operatorShiftChange(seed);
        case 'delayed':        return delayedWorkOrder(seed);
        case 'rejected-batch': return rejectedBatch(seed);
        case 'overloaded':     return overloadedLine(seed);
    }
}

export function runAllScenarios(seed = 42): ScenarioResult[] {
    return SCENARIO_NAMES.map(n => runScenario(n, seed));
}
