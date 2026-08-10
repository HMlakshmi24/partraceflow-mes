import { prisma } from '@/lib/services/database';

// ── Pure formula functions (exported for unit tests) ──────────────────────────

/** Mean Time Between Failures — seconds of runtime per failure event. */
export function calcMTBF(runtimeSeconds: number, failureCount: number): number {
    if (failureCount <= 0) return runtimeSeconds;
    return runtimeSeconds / failureCount;
}

/** Mean Time To Repair — average downtime duration per failure event. */
export function calcMTTR(totalDowntimeSeconds: number, failureCount: number): number {
    if (failureCount <= 0) return 0;
    return totalDowntimeSeconds / failureCount;
}

/** Scrap rate 0-100. */
export function calcScrapRate(goodCount: number, rejectCount: number): number {
    const total = goodCount + rejectCount;
    if (total <= 0) return 0;
    return Math.min(100, (rejectCount / total) * 100);
}

/** Throughput in parts per hour. */
export function calcThroughput(goodCount: number, periodHours: number): number {
    if (periodHours <= 0) return 0;
    return goodCount / periodHours;
}

/** Utilization 0-100: runtime as % of planned time. */
export function calcUtilization(runtimeSeconds: number, plannedSeconds: number): number {
    if (plannedSeconds <= 0) return 0;
    return Math.min(100, (runtimeSeconds / plannedSeconds) * 100);
}

/** Alarm frequency: events per hour. */
export function calcAlarmFrequency(alarmCount: number, periodHours: number): number {
    if (periodHours <= 0) return 0;
    return alarmCount / periodHours;
}

// ── DB-backed KPI engine ──────────────────────────────────────────────────────

export interface KPIResult {
    machineId:            string;
    periodHours:          number;
    mtbf:                 number; // seconds
    mttr:                 number; // seconds
    availability:         number; // 0-100
    utilization:          number; // 0-100
    scrapRate:            number; // 0-100
    throughput:           number; // parts/hour
    alarmFrequency:       number; // alarms/hour
    failureCount:         number;
    totalDowntimeSeconds: number;
    runtimeSeconds:       number;
    goodCount:            number;
    rejectCount:          number;
    alarmCount:           number;
}

export class KPIEngine {

    static async calculateForMachine(machineId: string, from: Date, to: Date): Promise<KPIResult> {
        const periodMs    = to.getTime() - from.getTime();
        const periodHours = periodMs / 3_600_000;

        const [runtime, downtimeRows, alarmCount] = await Promise.all([
            prisma.machineRuntime.findUnique({ where: { machineId } }),
            prisma.downtimeEvent.findMany({
                where: { machineId, startTime: { gte: from, lte: to }, status: 'CLOSED' },
                select: { durationSeconds: true },
            }),
            prisma.alarmEvent.count({ where: { machineId, startTime: { gte: from, lte: to } } }),
        ]);

        const failureCount         = downtimeRows.length;
        const totalDowntimeSeconds = downtimeRows.reduce((s, e) => s + (e.durationSeconds ?? 0), 0);
        const runtimeSeconds       = runtime?.runtimeSeconds   ?? 0;
        const goodCount            = runtime?.goodCount        ?? 0;
        const rejectCount          = runtime?.rejectCount      ?? 0;
        const plannedSeconds       = periodHours * 3600;

        const availability = plannedSeconds > 0
            ? Math.min(100, Math.round(((plannedSeconds - totalDowntimeSeconds) / plannedSeconds) * 1000) / 10)
            : 0;

        return {
            machineId,
            periodHours:          Math.round(periodHours * 10) / 10,
            mtbf:                 Math.round(calcMTBF(runtimeSeconds, failureCount)),
            mttr:                 Math.round(calcMTTR(totalDowntimeSeconds, failureCount)),
            availability,
            utilization:          Math.round(calcUtilization(runtimeSeconds, plannedSeconds) * 10) / 10,
            scrapRate:            Math.round(calcScrapRate(goodCount, rejectCount) * 10) / 10,
            throughput:           Math.round(calcThroughput(goodCount, periodHours) * 10) / 10,
            alarmFrequency:       Math.round(calcAlarmFrequency(alarmCount, periodHours) * 100) / 100,
            failureCount,
            totalDowntimeSeconds: Math.round(totalDowntimeSeconds),
            runtimeSeconds:       Math.round(runtimeSeconds),
            goodCount,
            rejectCount,
            alarmCount,
        };
    }

    /** Downtime broken down by reason category, sorted by total duration. */
    static async downtimeByCategory(machineId: string, from: Date, to: Date) {
        const events = await prisma.downtimeEvent.findMany({
            where: { machineId, startTime: { gte: from, lte: to }, status: 'CLOSED' },
            include: { reason: { select: { name: true } } },
        });

        const map = new Map<string, { count: number; totalSeconds: number }>();
        for (const e of events) {
            const key  = e.reason?.name ?? 'Unclassified';
            const prev = map.get(key) ?? { count: 0, totalSeconds: 0 };
            map.set(key, { count: prev.count + 1, totalSeconds: prev.totalSeconds + (e.durationSeconds ?? 0) });
        }

        return Array.from(map.entries())
            .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
            .map(([category, d]) => ({
                category,
                count:       d.count,
                totalSeconds: Math.round(d.totalSeconds),
                avgSeconds:   d.count > 0 ? Math.round(d.totalSeconds / d.count) : 0,
            }));
    }

    /** Aggregate KPIs across all machines (or those in a list). */
    static async aggregateFleet(
        machineIds: string[],
        from: Date,
        to: Date,
    ): Promise<{ avgMTBF: number; avgMTTR: number; avgUtilization: number; avgScrapRate: number }> {
        if (machineIds.length === 0) return { avgMTBF: 0, avgMTTR: 0, avgUtilization: 0, avgScrapRate: 0 };

        const results = await Promise.all(machineIds.map(id => KPIEngine.calculateForMachine(id, from, to)));
        const n = results.length;

        return {
            avgMTBF:        Math.round(results.reduce((s, r) => s + r.mtbf,        0) / n),
            avgMTTR:        Math.round(results.reduce((s, r) => s + r.mttr,        0) / n),
            avgUtilization: Math.round((results.reduce((s, r) => s + r.utilization, 0) / n) * 10) / 10,
            avgScrapRate:   Math.round((results.reduce((s, r) => s + r.scrapRate,   0) / n) * 10) / 10,
        };
    }
}
