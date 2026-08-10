import { RuntimeEngine } from '@/lib/services/RuntimeEngine';
import { prisma } from '@/lib/services/database';

export const DEFAULT_HEARTBEAT_THRESHOLD_SECONDS = 120; // 2 minutes

export interface HeartbeatCheckResult {
    checkedAt: Date;
    staleCount: number;
    staleMachineIds: string[];
}

export class HeartbeatMonitor {

    // Check all runtimes and mark stale machines as DOWN
    static async checkAll(
        thresholdSeconds = DEFAULT_HEARTBEAT_THRESHOLD_SECONDS,
    ): Promise<HeartbeatCheckResult> {
        const checkedAt = new Date();
        const staleIds = await RuntimeEngine.detectStaleMachines(thresholdSeconds);

        return {
            checkedAt,
            staleCount: staleIds.length,
            staleMachineIds: staleIds,
        };
    }

    // Receive a heartbeat for a machine and recover it if previously stale
    static async receive(
        machineId: string,
        payload: {
            status?: 'RUNNING' | 'IDLE' | 'DOWN' | 'MAINTENANCE';
            currentCycleTime?: number;
            idealCycleTime?: number;
            temperature?: number;
            alarmCode?: string | null;
        } = {},
    ): Promise<void> {
        const runtime = await prisma.machineRuntime.findUnique({
            where: { machineId },
            select: { status: true, alarmCode: true },
        });

        // If machine was stale-DOWN (HEARTBEAT_TIMEOUT) and heartbeat arrives — recover it
        const wasStaleDown =
            runtime?.status === 'DOWN' && runtime?.alarmCode === 'HEARTBEAT_TIMEOUT';

        const nextStatus = payload.status ?? (wasStaleDown ? 'RUNNING' : undefined);

        await RuntimeEngine.upsertHeartbeat(machineId, {
            ...payload,
            ...(nextStatus && { status: nextStatus }),
            // Clear heartbeat timeout alarm code on recovery
            ...(wasStaleDown && !payload.alarmCode && { alarmCode: null }),
        });
    }

    // Return machines whose heartbeat has gone stale (without marking them DOWN)
    static async listStale(
        thresholdSeconds = DEFAULT_HEARTBEAT_THRESHOLD_SECONDS,
    ): Promise<{ machineId: string; lastHeartbeat: Date | null; staleSec: number }[]> {
        const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
        const runtimes = await prisma.machineRuntime.findMany({
            where: {
                OR: [
                    { lastHeartbeat: null },
                    { lastHeartbeat: { lt: cutoff }, status: { in: ['RUNNING', 'IDLE'] } },
                ],
            },
            select: { machineId: true, lastHeartbeat: true },
        });

        const now = Date.now();
        return runtimes.map(r => ({
            machineId: r.machineId,
            lastHeartbeat: r.lastHeartbeat,
            staleSec: r.lastHeartbeat
                ? Math.round((now - r.lastHeartbeat.getTime()) / 1000)
                : -1,
        }));
    }
}
