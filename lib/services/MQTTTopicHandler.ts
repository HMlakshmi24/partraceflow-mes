import { z } from 'zod';
import { HeartbeatMonitor } from '@/lib/services/HeartbeatMonitor';
import { RuntimeEngine } from '@/lib/services/RuntimeEngine';
import { AlarmEngine } from '@/lib/services/AlarmEngine';
import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('MQTTTopicHandler');

// ── Payload schemas ───────────────────────────────────────────────────────────

const MachineStatusSchema = z.object({
    machineId: z.string().min(1),
    status: z.enum(['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE']),
});

const HeartbeatSchema = z.object({
    machineId:        z.string().min(1),
    status:           z.enum(['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE']).optional(),
    currentCycleTime: z.number().positive().optional(),
    idealCycleTime:   z.number().positive().optional(),
    temperature:      z.number().optional(),
    alarmCode:        z.string().nullable().optional(),
});

const CycleSchema = z.object({
    machineId:        z.string().min(1),
    good:             z.number().int().min(0).default(0),
    reject:           z.number().int().min(0).default(0),
    cycleTimeSeconds: z.number().positive(),
    // Optional per-cycle idempotency key. Edge devices/PLCs that can supply
    // a monotonically-increasing sequence number or UUID per cycle should —
    // it makes dedup exact instead of the content-hash heuristic below.
    cycleId:          z.string().optional(),
});

// HIGH-7 fix: MQTT publishes use QoS 1 ("at-least-once") — a redelivered
// cycle message previously double-incremented goodCount/rejectCount/
// cycleCount via RuntimeEngine.recordCycle's Prisma `increment`, silently
// corrupting the production counts OEEEngine calculates from. Dedup on
// `cycleId` when the device provides one, otherwise on a short window of
// identical (machineId, good, reject, cycleTimeSeconds) — the same
// content-hash approach already used for RFID reads in rfidConnector.ts.
const CYCLE_DEDUP_WINDOW_MS = 5_000;
const recentCycles = new Map<string, number>();

function isDuplicateCycle(key: string): boolean {
    const now = Date.now();
    const lastSeen = recentCycles.get(key);
    // Opportunistic cleanup so this map doesn't grow unbounded.
    if (recentCycles.size > 500) {
        for (const [k, t] of recentCycles) {
            if (now - t > CYCLE_DEDUP_WINDOW_MS) recentCycles.delete(k);
        }
    }
    if (lastSeen !== undefined && now - lastSeen < CYCLE_DEDUP_WINDOW_MS) return true;
    recentCycles.set(key, now);
    return false;
}

const AlarmSchema = z.object({
    machineId: z.string().min(1),
    alarmCode: z.string().min(1),
    severity:  z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    message:   z.string().optional(),
});

const DowntimeSchema = z.object({
    machineId: z.string().min(1),
    action:    z.enum(['start', 'end']),
    reasonId:  z.string().optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export class MQTTTopicHandler {
    /** factory/machine/status */
    static async handleStatus(raw: unknown): Promise<void> {
        const result = MachineStatusSchema.safeParse(raw);
        if (!result.success) {
            log.warn('invalid status payload', { issues: result.error.issues });
            return;
        }
        const { machineId, status } = result.data;
        await RuntimeEngine.upsertHeartbeat(machineId, { status });
    }

    /** factory/machine/heartbeat */
    static async handleHeartbeat(raw: unknown): Promise<void> {
        const result = HeartbeatSchema.safeParse(raw);
        if (!result.success) {
            log.warn('invalid heartbeat payload', { issues: result.error.issues });
            return;
        }
        const { machineId, ...payload } = result.data;

        // Clear alarms if alarmCode explicitly set to null
        if (Object.prototype.hasOwnProperty.call(result.data, 'alarmCode') && result.data.alarmCode === null) {
            await AlarmEngine.clearAll(machineId);
        } else if (result.data.alarmCode) {
            await AlarmEngine.open(machineId, { alarmCode: result.data.alarmCode });
        }

        await HeartbeatMonitor.receive(machineId, payload);
    }

    /** factory/machine/cycle */
    static async handleCycle(raw: unknown): Promise<void> {
        const result = CycleSchema.safeParse(raw);
        if (!result.success) {
            log.warn('invalid cycle payload', { issues: result.error.issues });
            return;
        }
        const { machineId, good, reject, cycleTimeSeconds, cycleId } = result.data;

        const dedupKey = cycleId
            ? `${machineId}:${cycleId}`
            : `${machineId}:${good}:${reject}:${cycleTimeSeconds}`;
        if (isDuplicateCycle(dedupKey)) {
            log.warn('duplicate cycle message dropped', { machineId, cycleId });
            return;
        }

        await RuntimeEngine.recordCycle(machineId, { good, reject, cycleTimeSeconds });
    }

    /** factory/machine/alarm */
    static async handleAlarm(raw: unknown): Promise<void> {
        const result = AlarmSchema.safeParse(raw);
        if (!result.success) {
            log.warn('invalid alarm payload', { issues: result.error.issues });
            return;
        }
        const { machineId, alarmCode, severity, message } = result.data;
        await AlarmEngine.open(machineId, { alarmCode, severity, message });
    }

    /**
     * factory/machine/downtime
     *
     * Bug fixes (found via audit):
     *  1. Never called RuntimeEngine.upsertHeartbeat — every other
     *     Machine.status write path in this app routes through it (the
     *     CRIT-5 "single required entry point" fix), but this one wrote
     *     DowntimeEvent rows directly and left Machine.status/
     *     MachineRuntime.status untouched. Net effect: an MQTT-reported
     *     downtime could be fully logged in DowntimeEvent while the
     *     dashboard/OEE/andon views — which read machine status, not this
     *     table — kept showing the machine as running.
     *  2. The "start" branch's find-then-create had no transactional guard,
     *     so a redelivered/duplicate MQTT start message (this app already
     *     treats QoS-1 redelivery as expected, not exceptional — see the
     *     handleCycle dedup fix) racing a concurrent start could create two
     *     OPEN events for the same machine. Wrapped in a Serializable
     *     transaction, matching the same fix applied to
     *     DowntimeService.startDowntime.
     */
    static async handleDowntime(raw: unknown): Promise<void> {
        const result = DowntimeSchema.safeParse(raw);
        if (!result.success) {
            log.warn('invalid downtime payload', { issues: result.error.issues });
            return;
        }
        const { machineId, action, reasonId } = result.data;

        if (action === 'start') {
            const MAX_ATTEMPTS = 3;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    await prisma.$transaction(async (tx) => {
                        // Only create if no open event already exists for this machine
                        // — a redelivered/duplicate "start" for an already-open event
                        // must stay a no-op, not reset startTime and lose the real duration.
                        const open = await tx.downtimeEvent.findFirst({
                            where: { machineId, status: 'OPEN', endTime: null },
                            select: { id: true },
                        });
                        if (!open) {
                            await tx.downtimeEvent.create({
                                data: {
                                    machineId,
                                    reasonId: reasonId ?? null,
                                    status: 'OPEN',
                                    startTime: new Date(),
                                },
                            });
                        }
                    }, { isolationLevel: 'Serializable' });
                    break;
                } catch (e: any) {
                    if (e?.code === 'P2034' && attempt < MAX_ATTEMPTS) continue; // write conflict — retry
                    throw e;
                }
            }
            await RuntimeEngine.upsertHeartbeat(machineId, { status: 'DOWN' });
        } else {
            // Close all open downtime events for this machine
            const now = new Date();
            const events = await prisma.downtimeEvent.findMany({
                where: { machineId, status: 'OPEN', endTime: null },
                select: { id: true, startTime: true },
            });
            for (const e of events) {
                const durationSeconds = (now.getTime() - e.startTime.getTime()) / 1000;
                await prisma.downtimeEvent.update({
                    where: { id: e.id },
                    data: {
                        endTime: now,
                        status: 'CLOSED',
                        durationSeconds,
                        durationMinutes: durationSeconds / 60,
                    },
                });
            }
            await RuntimeEngine.upsertHeartbeat(machineId, { status: 'RUNNING' });
        }
    }
}

