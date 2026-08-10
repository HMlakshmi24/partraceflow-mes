import { prisma } from '@/lib/services/database';

export interface OEEComponents {
    availability: number;   // 0-100
    performance:  number;   // 0-100
    quality:      number;   // 0-100
    oee:          number;   // 0-100
}

export interface RuntimeSnapshot {
    runtimeSeconds:  number;
    downtimeSeconds: number;
    goodCount:       number;
    rejectCount:     number;
    cycleCount:      number;
    idealCycleTime:  number;  // seconds per cycle
    plannedSeconds:  number;  // total planned production time for the period
}

// ── Pure formula functions (no DB calls — fully testable) ─────────────────────

export function calcAvailability(runtimeSeconds: number, plannedSeconds: number): number {
    if (plannedSeconds <= 0) return 0;
    return Math.min(100, Math.round((runtimeSeconds / plannedSeconds) * 1000) / 10);
}

export function calcPerformance(
    idealCycleTime: number,
    totalCount: number,
    runtimeSeconds: number,
): number {
    if (runtimeSeconds <= 0 || idealCycleTime <= 0) return 0;
    const ideal = idealCycleTime * totalCount;
    return Math.min(100, Math.round((ideal / runtimeSeconds) * 1000) / 10);
}

export function calcQuality(goodCount: number, totalCount: number): number {
    if (totalCount <= 0) return 0;
    return Math.min(100, Math.round((goodCount / totalCount) * 1000) / 10);
}

export function calcOEE(availability: number, performance: number, quality: number): number {
    return Math.round((availability / 100) * (performance / 100) * (quality / 100) * 1000 * 100) / 1000;
}

export function calculateOEEComponents(snap: RuntimeSnapshot): OEEComponents {
    const totalCount = snap.goodCount + snap.rejectCount;
    const availability = calcAvailability(snap.runtimeSeconds, snap.plannedSeconds);
    const performance  = calcPerformance(snap.idealCycleTime, totalCount, snap.runtimeSeconds);
    const quality      = calcQuality(snap.goodCount, totalCount);
    const oee          = calcOEE(availability, performance, quality);
    return { availability, performance, quality, oee };
}

// ── DB-backed snapshot persistence ───────────────────────────────────────────

export class OEEEngine {

    static async persistSnapshot(
        machineId: string,
        periodStart: Date,
        periodEnd: Date,
    ): Promise<OEEComponents | null> {
        const runtime = await prisma.machineRuntime.findUnique({ where: { machineId } });
        if (!runtime) return null;

        const plannedSeconds = (periodEnd.getTime() - periodStart.getTime()) / 1000;
        const idealCycleTime = runtime.idealCycleTime ?? 60;
        const totalCount = runtime.goodCount + runtime.rejectCount;

        const snap: RuntimeSnapshot = {
            runtimeSeconds:  runtime.runtimeSeconds,
            downtimeSeconds: runtime.downtimeSeconds,
            goodCount:       runtime.goodCount,
            rejectCount:     runtime.rejectCount,
            cycleCount:      runtime.cycleCount,
            idealCycleTime,
            plannedSeconds,
        };

        const components = calculateOEEComponents(snap);

        await prisma.oEESnapshot.create({
            data: {
                machineId,
                availability:    components.availability,
                performance:     components.performance,
                quality:         components.quality,
                oee:             components.oee,
                goodCount:       runtime.goodCount,
                rejectCount:     runtime.rejectCount,
                runtimeSeconds:  runtime.runtimeSeconds,
                downtimeSeconds: runtime.downtimeSeconds,
                plannedSeconds,
                periodStart,
                periodEnd,
            },
        });

        // Update the live OEE value on MachineRuntime
        await prisma.machineRuntime.update({
            where: { machineId },
            data: { oee: components.oee },
        });

        return components;
    }

    static async getLatestSnapshot(machineId: string): Promise<OEEComponents | null> {
        const snap = await prisma.oEESnapshot.findFirst({
            where: { machineId },
            orderBy: { createdAt: 'desc' },
        });
        if (!snap) return null;
        return {
            availability: snap.availability,
            performance:  snap.performance,
            quality:      snap.quality,
            oee:          snap.oee,
        };
    }

    // Calculate OEE for a machine over a wall-clock period using DowntimeEvent records
    static async calculateForPeriod(
        machineId: string,
        periodStart: Date,
        periodEnd: Date,
    ): Promise<OEEComponents> {
        const runtime = await prisma.machineRuntime.findUnique({ where: { machineId } });
        const machine = await prisma.machine.findUnique({
            where: { id: machineId },
            include: { productionLine: true },
        });

        const idealCycleTime = runtime?.idealCycleTime
            ?? machine?.productionLine?.targetCycleTime
            ?? 60;

        // Sum closed downtime events in the period
        const downtimeEvents = await prisma.downtimeEvent.findMany({
            where: {
                machineId,
                startTime: { gte: periodStart, lte: periodEnd },
                status: 'CLOSED',
            },
        });
        const downtimeSeconds = downtimeEvents.reduce(
            (sum, e) => sum + (e.durationSeconds ?? (e.durationMinutes ?? 0) * 60),
            0,
        );

        const plannedSeconds = (periodEnd.getTime() - periodStart.getTime()) / 1000;
        const runtimeSeconds = Math.max(0, plannedSeconds - downtimeSeconds);

        const goodCount   = runtime?.goodCount   ?? 0;
        const rejectCount = runtime?.rejectCount  ?? 0;

        const snap: RuntimeSnapshot = {
            runtimeSeconds,
            downtimeSeconds,
            goodCount,
            rejectCount,
            cycleCount:  runtime?.cycleCount ?? 0,
            idealCycleTime,
            plannedSeconds,
        };

        return calculateOEEComponents(snap);
    }
}
