import { prisma } from '@/lib/services/database';

export type AlarmSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlarmPayload {
    alarmCode: string;
    severity?: AlarmSeverity;
    message?: string;
}

export class AlarmEngine {
    /**
     * Open a new alarm. If an alarm with the same machineId+alarmCode is
     * already open (endTime null), the call is a no-op (deduplication).
     */
    static async open(machineId: string, payload: AlarmPayload): Promise<void> {
        const { alarmCode, severity = 'LOW', message } = payload;

        const existing = await prisma.alarmEvent.findFirst({
            where: { machineId, alarmCode, endTime: null },
            select: { id: true },
        });
        if (existing) return; // already open — deduplicated

        await prisma.alarmEvent.create({
            data: { machineId, alarmCode, severity, message: message ?? null },
        });
    }

    /**
     * Close all open alarms for a machine+code. Idempotent: no-op if already closed.
     */
    static async close(machineId: string, alarmCode: string): Promise<void> {
        await prisma.alarmEvent.updateMany({
            where: { machineId, alarmCode, endTime: null },
            data: { endTime: new Date() },
        });
    }

    /**
     * Clear ALL open alarms for a machine (used when machine sends alarmCode: null).
     */
    static async clearAll(machineId: string): Promise<void> {
        await prisma.alarmEvent.updateMany({
            where: { machineId, endTime: null },
            data: { endTime: new Date() },
        });
    }

    /** Count of active (unacknowledged, open) alarms across all machines or one machine. */
    static async activeCount(machineId?: string): Promise<number> {
        return prisma.alarmEvent.count({
            where: {
                ...(machineId ? { machineId } : {}),
                endTime: null,
                acknowledged: false,
            },
        });
    }

    /** Acknowledge an alarm by id. */
    static async acknowledge(id: string, acknowledgedBy: string): Promise<void> {
        await prisma.alarmEvent.update({
            where: { id },
            data: { acknowledged: true, acknowledgedBy },
        });
    }
}
