/**
 * SimulatorCore — deterministic factory simulation engine.
 * Pure functions only — no database access, safe to import in tests.
 *
 * Uses a seeded linear-congruential PRNG so every scenario is 100%
 * reproducible. Pass a different seed to explore stochastic variation.
 */

// ─── PRNG ──────────────────────────────────────────────────────────────────────

/** Seeded LCG PRNG. Returns values in [0, 1). */
export function createRng(seed: number): () => number {
    let s = (seed >>> 0) || 1;
    return function (): number {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// ─── Domain types ──────────────────────────────────────────────────────────────

export type MachineState = 'RUNNING' | 'IDLE' | 'DOWN' | 'MAINTENANCE';
export type AlarmSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface MachineConfig {
    machineId:              string;
    idealCycleTimeSeconds:  number;   // e.g. 45 s/part
    rejectRateBase:         number;   // baseline fraction [0,1]
    faultRatePpm:           number;   // faults per million cycles
    meanRepairTimeSeconds:  number;   // MTTR
    nominalTemperature:     number;   // °C at normal running
    temperatureVariance:    number;   // ± per tick
}

export interface SimConfig {
    seed:                   number;
    durationSeconds:        number;
    tickSeconds?:           number;    // default 60
    machines:               MachineConfig[];
    globalFaultMultiplier:  number;    // 1.0 = nominal rate
    shiftLengthSeconds:     number;
    operators?:             string[];
    /** Pre-scheduled forced breakdowns */
    injectBreakdown?: Array<{ machineId: string; atT: number; durationSeconds: number }>;
    /** Pre-scheduled forced alarms */
    injectAlarm?: Array<{
        machineId:       string;
        atT:             number;
        alarmCode:       string;
        severity:        AlarmSeverity;
        durationSeconds: number | null;
    }>;
    /** Work orders to track drift against */
    workOrders?: Array<{ id: string; machineId: string; startT: number; plannedDurationSeconds: number }>;
}

// ─── Event types ───────────────────────────────────────────────────────────────

export interface SimCycleEvent {
    machineId:         string;
    t:                 number;
    good:              number;
    reject:            number;
    cycleTimeSeconds:  number;
    temperature:       number;
}

export interface SimStatusEvent {
    machineId:  string;
    t:          number;
    fromState:  MachineState;
    toState:    MachineState;
    alarmCode:  string | null;
}

export interface SimAlarmEvent {
    machineId:       string;
    t:               number;
    alarmCode:       string;
    severity:        AlarmSeverity;
    message:         string;
    resolvedAtT:     number | null;
}

export interface SimShiftEvent {
    t:         number;
    type:      'SHIFT_START' | 'SHIFT_END' | 'OPERATOR_CHANGE';
    shiftName: string;
    operator:  string;
}

// ─── Runtime machine state ─────────────────────────────────────────────────────

export interface MachineSim {
    config:            MachineConfig;
    state:             MachineState;
    temperature:       number;
    goodCount:         number;
    rejectCount:       number;
    cycleCount:        number;
    runtimeSeconds:    number;
    downtimeSeconds:   number;
    idleSeconds:       number;
    recoveryCountdown: number | null;  // seconds until repair completes
    activeAlarms:      Set<string>;
}

export interface SimOutput {
    cycles:        SimCycleEvent[];
    statusEvents:  SimStatusEvent[];
    alarmEvents:   SimAlarmEvent[];
    shiftEvents:   SimShiftEvent[];
    finalStates:   MachineSim[];
    workOrderDrift: Record<string, number>;  // id → drift seconds (positive = late)
    durationSeconds: number;
}

// ─── Pure OEE helpers ──────────────────────────────────────────────────────────

export interface OEEComponents {
    availability: number;
    performance:  number;
    quality:      number;
    oee:          number;
}

export function calcMachineOEE(
    runtimeSeconds:   number,
    plannedSeconds:   number,
    goodCount:        number,
    totalCount:       number,
    idealCycleTime:   number,
): OEEComponents {
    const availability = plannedSeconds > 0
        ? Math.min(100, (runtimeSeconds / plannedSeconds) * 100)
        : 0;
    const performance = (runtimeSeconds > 0 && idealCycleTime > 0)
        ? Math.min(100, (idealCycleTime * totalCount / runtimeSeconds) * 100)
        : 0;
    const quality = totalCount > 0
        ? Math.min(100, (goodCount / totalCount) * 100)
        : 0;
    const oee = (availability / 100) * (performance / 100) * (quality / 100) * 100;
    return {
        availability: +availability.toFixed(1),
        performance:  +performance.toFixed(1),
        quality:      +quality.toFixed(1),
        oee:          +oee.toFixed(1),
    };
}

/** Summarise alarm counts by severity from a list of alarm events. */
export function countAlarmsBySeverity(alarms: SimAlarmEvent[]): Record<AlarmSeverity, number> {
    const out: Record<AlarmSeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const a of alarms) out[a.severity]++;
    return out;
}

/** Count how many alarms fired in a time window. */
export function countAlarmsInWindow(alarms: SimAlarmEvent[], fromT: number, toT: number): number {
    return alarms.filter(a => a.t >= fromT && a.t <= toT).length;
}

/** Uptime as a fraction 0-1 for a single machine's output. */
export function machineUptimeFraction(sim: MachineSim): number {
    const total = sim.runtimeSeconds + sim.downtimeSeconds + sim.idleSeconds;
    if (total <= 0) return 0;
    return sim.runtimeSeconds / total;
}

/** Reject rate 0-1 for a machine. */
export function machineRejectRate(sim: MachineSim): number {
    const total = sim.goodCount + sim.rejectCount;
    if (total <= 0) return 0;
    return sim.rejectCount / total;
}

/** Schedule drift in seconds for a work order. Positive = late. */
export function calcWorkOrderDrift(
    actualStartT:       number,
    actualEndT:         number | null,
    plannedStartT:      number,
    plannedDurationSec: number,
): number {
    const plannedEndT = plannedStartT + plannedDurationSec;
    const observedEnd = actualEndT ?? (actualStartT + plannedDurationSec * 1.5);
    return observedEnd - plannedEndT;
}

// ─── State machine helpers ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<MachineState, MachineState[]> = {
    RUNNING:     ['IDLE', 'DOWN', 'MAINTENANCE'],
    IDLE:        ['RUNNING', 'DOWN', 'MAINTENANCE'],
    DOWN:        ['RUNNING', 'MAINTENANCE'],
    MAINTENANCE: ['RUNNING', 'IDLE'],
};

export function canTransitionMachine(from: MachineState, to: MachineState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Alarm catalog ─────────────────────────────────────────────────────────────

interface AlarmTemplate {
    severity: AlarmSeverity;
    message:  string;
}

const FAULT_ALARMS: Record<string, AlarmTemplate> = {
    OVERTEMP:          { severity: 'HIGH',     message: 'Temperature exceeded safe limit' },
    SPINDLE_OVERLOAD:  { severity: 'HIGH',     message: 'Spindle motor overload detected' },
    COOLANT_LOW:       { severity: 'MEDIUM',   message: 'Coolant level below minimum' },
    TOOL_WEAR:         { severity: 'MEDIUM',   message: 'Tool wear threshold exceeded' },
    VIBRATION_HIGH:    { severity: 'HIGH',     message: 'Abnormal vibration detected' },
    ESTOP:             { severity: 'CRITICAL', message: 'Emergency stop activated' },
    FEED_JAM:          { severity: 'HIGH',     message: 'Material feed jam detected' },
    QUALITY_DEVIATION: { severity: 'MEDIUM',   message: 'Part dimension out of tolerance' },
    HEARTBEAT_TIMEOUT: { severity: 'CRITICAL', message: 'Machine heartbeat lost' },
    PRESSURE_DROP:     { severity: 'MEDIUM',   message: 'Hydraulic pressure below setpoint' },
};

const FAULT_ALARM_CODES = Object.keys(FAULT_ALARMS);

function pickAlarmCode(rng: () => number): string {
    return FAULT_ALARM_CODES[Math.floor(rng() * FAULT_ALARM_CODES.length)];
}

// ─── Core simulation ──────────────────────────────────────────────────────────

const DEFAULT_TICK = 60;
const DEFAULT_OPERATORS = ['Ramesh.Kumar', 'Priya.Nair', 'Ravi.Shankar', 'Meena.Pillai'];
const SHIFTS = ['Day Shift', 'Afternoon Shift', 'Night Shift'];

export function runSimulation(config: SimConfig): SimOutput {
    const rng        = createRng(config.seed);
    const tick       = config.tickSeconds ?? DEFAULT_TICK;
    const operators  = config.operators ?? DEFAULT_OPERATORS;

    const cycles:       SimCycleEvent[]  = [];
    const statusEvents: SimStatusEvent[] = [];
    const alarmEvents:  SimAlarmEvent[]  = [];
    const shiftEvents:  SimShiftEvent[]  = [];

    // Initialise machine states
    const machines: MachineSim[] = config.machines.map(cfg => ({
        config: cfg,
        state:             'IDLE' as const,
        temperature:       cfg.nominalTemperature,
        goodCount:         0,
        rejectCount:       0,
        cycleCount:        0,
        runtimeSeconds:    0,
        downtimeSeconds:   0,
        idleSeconds:       0,
        recoveryCountdown: null,
        activeAlarms:      new Set<string>(),
    }));

    // Work order tracking: actual start and end times
    const woActual: Record<string, { start: number | null; end: number | null }> = {};
    for (const wo of config.workOrders ?? []) {
        woActual[wo.id] = { start: null, end: null };
    }

    // Main time loop
    for (let t = 0; t < config.durationSeconds; t += tick) {
        // ── Shift events ──────────────────────────────────────────────────────
        if (t % config.shiftLengthSeconds === 0) {
            const shiftIdx  = Math.floor(t / config.shiftLengthSeconds) % SHIFTS.length;
            const opIdx     = Math.floor(rng() * operators.length);
            const type      = t === 0 ? 'SHIFT_START' : 'SHIFT_END';
            shiftEvents.push({ t, type, shiftName: SHIFTS[shiftIdx], operator: operators[opIdx] });
            if (t > 0) {
                // Brief idle period for operator handover
                for (const m of machines) {
                    if ((m as any).config && m.state === 'RUNNING') {
                        statusEvents.push({ machineId: (m as any).config.machineId, t, fromState: 'RUNNING', toState: 'IDLE', alarmCode: null });
                        m.state = 'IDLE';
                    }
                }
                const newOpIdx = Math.floor(rng() * operators.length);
                shiftEvents.push({ t, type: 'OPERATOR_CHANGE', shiftName: SHIFTS[shiftIdx], operator: operators[newOpIdx] });
            }
        }

        for (let mi = 0; mi < machines.length; mi++) {
            const m   = machines[mi];
            const cfg = config.machines[mi];

            // ── Injected breakdowns ───────────────────────────────────────────
            const breakdown = (config.injectBreakdown ?? []).find(b => b.machineId === cfg.machineId && b.atT === t);
            if (breakdown && m.state !== 'DOWN') {
                const alarmCode = 'ESTOP';
                statusEvents.push({ machineId: cfg.machineId, t, fromState: m.state, toState: 'DOWN', alarmCode });
                alarmEvents.push({
                    machineId: cfg.machineId, t,
                    alarmCode, severity: 'CRITICAL',
                    message: FAULT_ALARMS[alarmCode].message,
                    resolvedAtT: t + breakdown.durationSeconds,
                });
                m.state = 'DOWN';
                m.recoveryCountdown = breakdown.durationSeconds;
                m.activeAlarms.add(alarmCode);
            }

            // ── Injected alarms ───────────────────────────────────────────────
            for (const ia of (config.injectAlarm ?? []).filter(a => a.machineId === cfg.machineId && a.atT === t)) {
                if (!m.activeAlarms.has(ia.alarmCode)) {
                    alarmEvents.push({
                        machineId: cfg.machineId, t,
                        alarmCode: ia.alarmCode, severity: ia.severity,
                        message: FAULT_ALARMS[ia.alarmCode]?.message ?? ia.alarmCode,
                        resolvedAtT: ia.durationSeconds != null ? t + ia.durationSeconds : null,
                    });
                    m.activeAlarms.add(ia.alarmCode);
                }
            }

            // ── Clear resolved alarms ─────────────────────────────────────────
            for (const ev of alarmEvents.filter(a => a.machineId === cfg.machineId && a.resolvedAtT === t)) {
                m.activeAlarms.delete(ev.alarmCode);
            }

            // ── State machine step ─────────────────────────────────────────────
            if (m.state === 'DOWN' || m.state === 'MAINTENANCE') {
                m.downtimeSeconds += tick;
                if (m.recoveryCountdown !== null) {
                    m.recoveryCountdown -= tick;
                    if (m.recoveryCountdown <= 0) {
                        m.recoveryCountdown = null;
                        statusEvents.push({ machineId: cfg.machineId, t, fromState: m.state, toState: 'RUNNING', alarmCode: null });
                        m.state = 'RUNNING';
                    }
                }

            } else if (m.state === 'IDLE') {
                m.idleSeconds += tick;
                // Probabilistically start running (80% chance per tick if not in handover)
                if (rng() < 0.8) {
                    statusEvents.push({ machineId: cfg.machineId, t, fromState: 'IDLE', toState: 'RUNNING', alarmCode: null });
                    m.state = 'RUNNING';
                }

            } else {  // RUNNING
                m.runtimeSeconds += tick;
                // Update temperature: drift toward nominal + small noise
                const tempTarget = cfg.nominalTemperature + (rng() - 0.4) * cfg.temperatureVariance;
                m.temperature = m.temperature + (tempTarget - m.temperature) * 0.1;

                // Cycles produced this tick
                const cyclesThisTick = Math.max(0, Math.floor(tick / cfg.idealCycleTimeSeconds));
                if (cyclesThisTick > 0) {
                    // Reject rate increases with fault probability
                    const faultP = (cfg.faultRatePpm / 1_000_000) * config.globalFaultMultiplier;
                    const rejectP = Math.min(0.95, cfg.rejectRateBase + faultP * 100);
                    let good   = 0;
                    let reject = 0;
                    for (let c = 0; c < cyclesThisTick; c++) {
                        if (rng() < rejectP) reject++; else good++;
                    }
                    m.goodCount   += good;
                    m.rejectCount += reject;
                    m.cycleCount  += cyclesThisTick;
                    cycles.push({
                        machineId:        cfg.machineId, t,
                        good, reject,
                        cycleTimeSeconds: cfg.idealCycleTimeSeconds * (0.9 + rng() * 0.2),
                        temperature:      m.temperature,
                    });
                }

                // Spontaneous fault injection
                const faultProb = (cfg.faultRatePpm / 1_000_000) * config.globalFaultMultiplier * tick;
                if (rng() < faultProb) {
                    const alarmCode = pickAlarmCode(rng);
                    const template  = FAULT_ALARMS[alarmCode];
                    const repairT   = cfg.meanRepairTimeSeconds * (0.5 + rng());
                    statusEvents.push({ machineId: cfg.machineId, t, fromState: 'RUNNING', toState: 'DOWN', alarmCode });
                    alarmEvents.push({
                        machineId: cfg.machineId, t,
                        alarmCode, severity: template.severity,
                        message: template.message,
                        resolvedAtT: t + repairT,
                    });
                    m.state = 'DOWN';
                    m.recoveryCountdown = repairT;
                    m.activeAlarms.add(alarmCode);
                }

                // Work order tracking
                for (const wo of (config.workOrders ?? []).filter(w => w.machineId === cfg.machineId)) {
                    if (t >= wo.startT && woActual[wo.id].start === null) {
                        woActual[wo.id].start = t;
                    }
                    const plannedEndT = wo.startT + wo.plannedDurationSeconds;
                    if (m.runtimeSeconds >= wo.plannedDurationSeconds && woActual[wo.id].end === null) {
                        woActual[wo.id].end = t;
                    }
                    // If we hit planned end and order not done, mark overdue
                    if (t >= plannedEndT && woActual[wo.id].end === null) {
                        woActual[wo.id].end = t + tick;  // mark as slightly late
                    }
                }
            }
        }
    }

    // Final OEE/drift calculations
    const workOrderDrift: Record<string, number> = {};
    for (const wo of (config.workOrders ?? [])) {
        const actual = woActual[wo.id];
        workOrderDrift[wo.id] = calcWorkOrderDrift(
            actual.start ?? wo.startT,
            actual.end,
            wo.startT,
            wo.plannedDurationSeconds,
        );
    }

    return {
        cycles,
        statusEvents,
        alarmEvents,
        shiftEvents,
        finalStates: machines,
        workOrderDrift,
        durationSeconds: config.durationSeconds,
    };
}

// ─── Scenario summary ──────────────────────────────────────────────────────────

export interface ScenarioSummary {
    totalCycles:        number;
    goodUnits:          number;
    rejectUnits:        number;
    uptimeFraction:     number;   // 0-1
    downtimeMinutes:    number;
    alarmCount:         number;
    criticalAlarmCount: number;
    oeeByMachine:       Record<string, OEEComponents>;
    scheduleDriftByWO:  Record<string, number>;
}

export function summariseSimOutput(output: SimOutput, durationSeconds: number): ScenarioSummary {
    let totalCycles = 0, goodUnits = 0, rejectUnits = 0;
    let totalRuntime = 0, totalDown = 0;
    const oeeByMachine: Record<string, OEEComponents> = {};

    for (const m of output.finalStates) {
        const cfg = (m as any).config as MachineConfig;
        totalCycles  += m.cycleCount;
        goodUnits    += m.goodCount;
        rejectUnits  += m.rejectCount;
        totalRuntime += m.runtimeSeconds;
        totalDown    += m.downtimeSeconds;
        oeeByMachine[cfg.machineId] = calcMachineOEE(
            m.runtimeSeconds, durationSeconds,
            m.goodCount, m.goodCount + m.rejectCount,
            cfg.idealCycleTimeSeconds,
        );
    }

    const totalTime = totalRuntime + totalDown + output.finalStates.reduce((s, m) => s + m.idleSeconds, 0);
    const bySev = countAlarmsBySeverity(output.alarmEvents);

    return {
        totalCycles,
        goodUnits,
        rejectUnits,
        uptimeFraction:     totalTime > 0 ? totalRuntime / totalTime : 0,
        downtimeMinutes:    totalDown / 60,
        alarmCount:         output.alarmEvents.length,
        criticalAlarmCount: bySev.CRITICAL,
        oeeByMachine,
        scheduleDriftByWO:  output.workOrderDrift,
    };
}
