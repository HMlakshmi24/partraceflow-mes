/**
 * POST /api/simulation  — run a named scenario and replay events into the DB.
 * GET  /api/simulation  — list available scenarios and last run metadata.
 *
 * Allowed roles: ADMIN, SUPERVISOR.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, getRequestSession } from '@/lib/api-auth';
import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { RuntimeEngine } from '@/lib/services/RuntimeEngine';
import { AlarmEngine } from '@/lib/services/AlarmEngine';
import { HistorianService } from '@/lib/services/HistorianService';
import {
    runScenario,
    SCENARIO_NAMES,
    type ScenarioName,
} from '@/lib/simulation/Scenarios';
import { summariseSimOutput } from '@/lib/simulation/SimulatorCore';

const ALLOWED = ['ADMIN', 'SUPERVISOR'];

const RunSchema = z.object({
    scenario: z.enum(SCENARIO_NAMES),
    seed:     z.number().int().positive().optional().default(42),
    dryRun:   z.boolean().optional().default(false),
});

// ─── GET — list scenarios ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    if (process.env.MES_ENABLE_SIMULATION !== '1') {
        return NextResponse.json({ error: 'Simulation is disabled. Set MES_ENABLE_SIMULATION=1 to enable.' }, { status: 403 });
    }
    const denied = await requireRole(req, ALLOWED);
    if (denied) return denied;

    return NextResponse.json({
        scenarios: SCENARIO_NAMES.map(name => ({
            name,
            description: SCENARIO_DESCRIPTIONS[name],
        })),
    });
}

const SCENARIO_DESCRIPTIONS: Record<ScenarioName, string> = {
    'normal':         'Standard 8-hour shift — baseline OEE reference',
    'breakdown':      'CNC-01 emergency stop at t=1h, 45-min repair, schedule drift',
    'alarm-storm':    'Cascade of 7+ alarms across 5 machines within 5 minutes',
    'maintenance':    'Planned maintenance at shift start, recovery at t=1h',
    'shift-change':   'Two consecutive shifts with operator handover gap',
    'delayed':        'Multiple breakdowns push work orders past planned completion',
    'rejected-batch': 'WLD-01 at 35% reject rate — quality intervention required',
    'overloaded':     '5 work orders queued beyond single-shift capacity',
};

// ─── POST — run scenario ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    if (process.env.MES_ENABLE_SIMULATION !== '1') {
        return NextResponse.json({ error: 'Simulation is disabled. Set MES_ENABLE_SIMULATION=1 to enable.' }, { status: 403 });
    }
    const denied = await requireRole(req, ALLOWED);
    if (denied) return denied;

    const session = getRequestSession(req)!;
    const log = createLogger('api/simulation', req.headers.get('x-correlation-id') ?? undefined);

    let body: unknown;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = RunSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { scenario, seed, dryRun } = parsed.data;
    log.info('simulation run started', { scenario, seed, dryRun });

    // ── 1. Generate simulation output (pure, no DB) ───────────────────────────
    const result  = runScenario(scenario as ScenarioName, seed);
    const summary = summariseSimOutput(result.output, result.config.durationSeconds);

    if (dryRun) {
        return NextResponse.json({ scenario, seed, dryRun: true, summary, eventCounts: {
            cycles:      result.output.cycles.length,
            statusEvents: result.output.statusEvents.length,
            alarmEvents:  result.output.alarmEvents.length,
            shiftEvents:  result.output.shiftEvents.length,
        }});
    }

    // ── 2. Resolve machine DB ids ─────────────────────────────────────────────
    const machineIds = [...new Set(result.config.machines.map(m => m.machineId))];
    const dbMachines = await prisma.machine.findMany({
        where: { code: { in: machineIds } },
        select: { id: true, code: true },
    });
    const machineMap = new Map(dbMachines.map(m => [m.code, m.id]));

    const missingCodes = machineIds.filter(c => !machineMap.has(c));
    if (missingCodes.length > 0) {
        log.error('simulation machines not found in DB', { missingCodes });
        return NextResponse.json({
            error: `Machine(s) not found in database: ${missingCodes.join(', ')}. Seed the machine table first.`,
        }, { status: 422 });
    }

    // ── 3. Replay status events → RuntimeEngine ───────────────────────────────
    const simStart = Date.now();
    let statusReplayed = 0;
    for (const ev of result.output.statusEvents) {
        const machineId = machineMap.get(ev.machineId);
        if (!machineId) continue;
        try {
            await RuntimeEngine.upsertHeartbeat(machineId, {
                status:    ev.toState as 'RUNNING' | 'IDLE' | 'DOWN' | 'MAINTENANCE',
                alarmCode: ev.alarmCode ?? undefined,
            });
            statusReplayed++;
        } catch (e) {
            log.error('status event replay failed', { machineId, message: e instanceof Error ? e.message : String(e) });
        }
    }

    // ── 4. Replay cycle events → RuntimeEngine ────────────────────────────────
    let cyclesReplayed = 0;
    for (const ev of result.output.cycles) {
        const machineId = machineMap.get(ev.machineId);
        if (!machineId) continue;
        try {
            await RuntimeEngine.recordCycle(machineId, {
                good:              ev.good,
                reject:            ev.reject,
                cycleTimeSeconds:  Math.round(ev.cycleTimeSeconds),
            });
            cyclesReplayed++;
        } catch (e) {
            log.error('cycle event replay failed', { machineId, message: e instanceof Error ? e.message : String(e) });
        }
    }

    // ── 5. Replay alarms → AlarmEngine ───────────────────────────────────────
    let alarmsReplayed = 0;
    for (const ev of result.output.alarmEvents) {
        const machineId = machineMap.get(ev.machineId);
        if (!machineId) continue;
        try {
            await AlarmEngine.open(machineId, {
                alarmCode: ev.alarmCode,
                severity:  ev.severity,
                message:   ev.message,
            });
            if (ev.resolvedAtT !== null) {
                await AlarmEngine.close(machineId, ev.alarmCode);
            }
            alarmsReplayed++;
        } catch (e) {
            log.error('alarm replay failed', { machineId, message: e instanceof Error ? e.message : String(e) });
        }
    }

    // ── 6. Historian records for each cycle (batch) ────────────────────────────
    const historianBatch = result.output.cycles.map(ev => {
        const machineId = machineMap.get(ev.machineId)!;
        return {
            machineId,
            signalType:     'CYCLE_DATA',
            tagName:        'cycle_summary',
            value:          ev.good + ev.reject,
            quality:        'GOOD' as const,
            source:         'SYSTEM' as const,
            timestamp:      new Date(simStart + ev.t * 1000),
            retentionClass: 'HOT' as const,
        };
    }).filter(r => r.machineId);

    try {
        await HistorianService.recordBatch(historianBatch);
    } catch (e) {
        log.error('historian batch failed', { message: e instanceof Error ? e.message : String(e) });
        // Non-fatal
    }

    // ── 7. Audit log ─────────────────────────────────────────────────────────
    await AuditService.log(
        EventType.AUDIT_CHANGE,
        `Simulation "${scenario}" (seed ${seed}) replayed by ${session.username}`,
        { scenario, seed, statusReplayed, cyclesReplayed, alarmsReplayed, historianRecords: historianBatch.length },
        session.userId,
    );

    log.info('simulation run complete', { statusReplayed, cyclesReplayed, alarmsReplayed });

    return NextResponse.json({
        scenario,
        seed,
        summary,
        replayed: { statusEvents: statusReplayed, cycleEvents: cyclesReplayed, alarmEvents: alarmsReplayed, historianRecords: historianBatch.length },
    });
}
