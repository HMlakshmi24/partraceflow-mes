import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('RuntimeEngine');

export type RuntimeStatus = 'RUNNING' | 'IDLE' | 'DOWN' | 'MAINTENANCE';

export const MACHINE_STATUSES: readonly RuntimeStatus[] = ['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE'];

export function isValidMachineStatus(status: unknown): status is RuntimeStatus {
    return typeof status === 'string' && (MACHINE_STATUSES as readonly string[]).includes(status);
}

export interface HeartbeatPayload {
    status?: RuntimeStatus;
    currentCycleTime?: number;
    idealCycleTime?: number;
    temperature?: number;
    alarmCode?: string | null;
}

export interface CycleDelta {
    good: number;       // parts accepted this cycle
    reject: number;     // parts rejected this cycle
    cycleTimeSeconds: number;
}

export class RuntimeEngine {

    // ── Heartbeat ─────────────────────────────────────────────────────────────

    // CRIT-5 fix: this is the single point through which Machine.status may
    // change — it keeps Machine.status and MachineRuntime.status in sync and
    // drives downtime-event auto open/close. Other services (DowntimeService,
    // TelemetryService, AdvancedWorkflowEngine, the downtime API route) call
    // through here instead of writing prisma.machine.update({status}) directly.
    static async upsertHeartbeat(machineId: string, payload: HeartbeatPayload): Promise<void> {
        if (payload.status !== undefined && !isValidMachineStatus(payload.status)) {
            log.warn('Rejected invalid machine status', { machineId, status: payload.status });
            return;
        }
        const now = new Date();
        const runtime = await prisma.machineRuntime.findUnique({ where: { machineId } });

        if (runtime) {
            const prevStatus = runtime.status as RuntimeStatus;
            const newStatus = payload.status ?? prevStatus;
            const elapsedSec = runtime.lastHeartbeat
                ? Math.max(0, (now.getTime() - runtime.lastHeartbeat.getTime()) / 1000)
                : 0;

            const statusDelta = RuntimeEngine._statusDelta(prevStatus, newStatus, elapsedSec);

            await prisma.machineRuntime.update({
                where: { machineId },
                data: {
                    status: newStatus,
                    lastHeartbeat: now,
                    runtimeSeconds:  { increment: statusDelta.runtimeSeconds },
                    idleSeconds:     { increment: statusDelta.idleSeconds },
                    downtimeSeconds: { increment: statusDelta.downtimeSeconds },
                    ...(payload.currentCycleTime !== undefined && { currentCycleTime: payload.currentCycleTime }),
                    ...(payload.idealCycleTime   !== undefined && { idealCycleTime:   payload.idealCycleTime }),
                    ...(payload.temperature      !== undefined && { temperature:       payload.temperature }),
                    ...(payload.alarmCode        !== undefined && { alarmCode:         payload.alarmCode }),
                },
            });

            // Auto-manage downtime events when status crosses the DOWN/MAINTENANCE boundary
            if (prevStatus !== newStatus) {
                await RuntimeEngine._handleStatusTransition(machineId, prevStatus, newStatus, now);
            }
        } else {
            await prisma.machineRuntime.create({
                data: {
                    machineId,
                    status: payload.status ?? 'IDLE',
                    lastHeartbeat: now,
                    idealCycleTime: payload.idealCycleTime,
                    currentCycleTime: payload.currentCycleTime,
                    temperature: payload.temperature,
                    alarmCode: payload.alarmCode,
                },
            });
        }

        // Keep Machine.status in sync
        if (payload.status) {
            await prisma.machine.update({
                where: { id: machineId },
                data: { status: payload.status },
            }).catch(() => {/* machine may not exist yet in test contexts */});
        }
    }

    // ── Cycle recording ───────────────────────────────────────────────────────

    static async recordCycle(machineId: string, delta: CycleDelta): Promise<void> {
        await prisma.machineRuntime.upsert({
            where: { machineId },
            create: {
                machineId,
                goodCount:       delta.good,
                rejectCount:     delta.reject,
                cycleCount:      1,
                currentCycleTime: delta.cycleTimeSeconds,
                runtimeSeconds:   delta.cycleTimeSeconds,
            },
            update: {
                goodCount:        { increment: delta.good },
                rejectCount:      { increment: delta.reject },
                cycleCount:       { increment: 1 },
                currentCycleTime: delta.cycleTimeSeconds,
                runtimeSeconds:   { increment: delta.cycleTimeSeconds },
                lastHeartbeat:    new Date(),
            },
        });
    }

    // ── Stale-machine detection ────────────────────────────────────────────────

    static async detectStaleMachines(thresholdSeconds: number): Promise<string[]> {
        const cutoff = new Date(Date.now() - thresholdSeconds * 1000);

        const stale = await prisma.machineRuntime.findMany({
            where: {
                lastHeartbeat: { not: null, lt: cutoff },
                status: { in: ['RUNNING', 'IDLE'] },
            },
            select: { machineId: true },
        });

        const staleIds = stale.map(r => r.machineId);

        for (const machineId of staleIds) {
            await RuntimeEngine.upsertHeartbeat(machineId, { status: 'DOWN', alarmCode: 'HEARTBEAT_TIMEOUT' });
        }

        return staleIds;
    }

    // ── Recovery ──────────────────────────────────────────────────────────────

    static async recover(machineId: string): Promise<void> {
        await RuntimeEngine.upsertHeartbeat(machineId, { status: 'RUNNING', alarmCode: null });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static _statusDelta(
        prev: RuntimeStatus,
        _next: RuntimeStatus,
        elapsedSec: number,
    ): { runtimeSeconds: number; idleSeconds: number; downtimeSeconds: number } {
        if (prev === 'RUNNING') return { runtimeSeconds: elapsedSec, idleSeconds: 0, downtimeSeconds: 0 };
        if (prev === 'IDLE')    return { runtimeSeconds: 0, idleSeconds: elapsedSec, downtimeSeconds: 0 };
        return { runtimeSeconds: 0, idleSeconds: 0, downtimeSeconds: elapsedSec };
    }

    private static async _handleStatusTransition(
        machineId: string,
        prev: RuntimeStatus,
        next: RuntimeStatus,
        now: Date,
    ): Promise<void> {
        const wasDown = prev === 'DOWN' || prev === 'MAINTENANCE';
        const isDown  = next === 'DOWN' || next === 'MAINTENANCE';

        if (!wasDown && isDown) {
            // Entering DOWN/MAINTENANCE — auto-start a downtime event
            const existing = await prisma.downtimeEvent.findFirst({
                where: { machineId, status: 'OPEN', endTime: null },
            });
            if (!existing) {
                await prisma.downtimeEvent.create({
                    data: {
                        machineId,
                        startTime: now,
                        status: 'OPEN',
                        reportedBy: 'system',
                        rootCause: next === 'MAINTENANCE' ? 'Maintenance mode activated' : 'Heartbeat timeout or status transition',
                    },
                });
            }
        }

        if (wasDown && !isDown) {
            // Leaving DOWN/MAINTENANCE — close open downtime events
            const openEvents = await prisma.downtimeEvent.findMany({
                where: { machineId, status: 'OPEN', endTime: null },
            });
            for (const ev of openEvents) {
                const durationSec = (now.getTime() - ev.startTime.getTime()) / 1000;
                await prisma.downtimeEvent.update({
                    where: { id: ev.id },
                    data: {
                        endTime: now,
                        status: 'CLOSED',
                        durationMinutes: durationSec / 60,
                        durationSeconds: durationSec,
                        correctiveAction: 'Auto-closed on machine recovery',
                    },
                });
            }
        }
    }
}
