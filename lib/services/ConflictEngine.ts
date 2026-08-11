import { prisma } from '@/lib/services/database';
import { type ConflictType, detectOverlap } from '@/lib/services/SchedulerService';

export interface ConflictRecord {
    id:           string;
    workOrderId:  string | null;
    machineId:    string | null;
    conflictType: ConflictType;
    severity:     string;
    description:  string;
    isBlocking:   boolean;
    detectedAt:   Date;
    resolvedAt:   Date | null;
}

export class ConflictEngine {

    // ── Detection ─────────────────────────────────────────────────────────────

    /**
     * Check if a proposed schedule (machineId, start, end) conflicts with
     * existing ones.
     */
    static async detectOverlapConflict(
        machineId: string,
        start:     Date,
        end:       Date,
        excludeScheduleId?: string,
    ): Promise<boolean> {
        const existing = await prisma.productionSchedule.findMany({
            where: {
                machineId,
                status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
                ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
                plannedEnd:   { gt: start },
                plannedStart: { lt: end },
            },
        });
        return existing.length > 0;
    }

    /** Check if a machine is currently DOWN or MAINTENANCE. */
    static async detectMachineDown(machineId: string): Promise<{ isDown: boolean; status: string }> {
        const m = await prisma.machine.findUnique({
            where: { id: machineId },
            select: { status: true },
        });
        const status = m?.status ?? 'UNKNOWN';
        return { isDown: ['DOWN', 'MAINTENANCE'].includes(status), status };
    }

    /** Check if a machine has capability for a given productCode. */
    static async detectCapabilityMismatch(
        machineId:   string,
        productCode: string,
    ): Promise<boolean> {
        const cap = await prisma.machineCapability.findFirst({
            where: {
                machineId,
                enabled: true,
                OR: [{ productCode: null }, { productCode }],
            },
        });
        return cap === null; // true = mismatch (no capability found)
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    static async persist(data: {
        workOrderId?: string;
        machineId?:   string;
        conflictType: ConflictType;
        severity?:    'CRITICAL' | 'WARNING' | 'INFO';
        description:  string;
        isBlocking?:  boolean;
    }): Promise<ConflictRecord> {
        return prisma.schedulingConflict.create({
            data: {
                workOrderId:  data.workOrderId  ?? null,
                machineId:    data.machineId    ?? null,
                conflictType: data.conflictType,
                severity:     data.severity     ?? 'CRITICAL',
                description:  data.description,
                isBlocking:   data.isBlocking   ?? true,
            },
        }) as Promise<ConflictRecord>;
    }

    static async resolve(id: string): Promise<void> {
        await prisma.schedulingConflict.update({
            where: { id },
            data: { resolvedAt: new Date() },
        });
    }

    static async resolveByMachine(machineId: string, conflictType?: ConflictType): Promise<number> {
        const result = await prisma.schedulingConflict.updateMany({
            where: {
                machineId,
                resolvedAt: null,
                ...(conflictType ? { conflictType } : {}),
            },
            data: { resolvedAt: new Date() },
        });
        return result.count;
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    static async getActive(machineId?: string, workOrderId?: string): Promise<ConflictRecord[]> {
        return prisma.schedulingConflict.findMany({
            where: {
                resolvedAt: null,
                ...(machineId   ? { machineId }   : {}),
                ...(workOrderId ? { workOrderId }  : {}),
            },
            orderBy: { detectedAt: 'desc' },
            take: 500,
        }) as Promise<ConflictRecord[]>;
    }

    static async countActive(): Promise<number> {
        return prisma.schedulingConflict.count({ where: { resolvedAt: null, isBlocking: true } });
    }

    static async getBlockingCount(machineId?: string): Promise<number> {
        return prisma.schedulingConflict.count({
            where: {
                resolvedAt: null,
                isBlocking: true,
                ...(machineId ? { machineId } : {}),
            },
        });
    }
}
