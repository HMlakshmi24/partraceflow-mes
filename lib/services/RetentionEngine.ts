import { prisma } from '@/lib/services/database';
import { HistorianService, type RetentionClass } from '@/lib/services/HistorianService';

export const HOT_MAX_AGE_HOURS  = 24;
export const WARM_MAX_AGE_DAYS  = 30;
export const WARM_WINDOW_MS     = 3_600_000;        // 1 hour — aggregation bucket for WARM
export const COLD_WINDOW_MS     = 86_400_000;       // 1 day  — aggregation bucket for COLD

export interface RetentionCycleResult {
    hotToWarm:  number; // HOT records aggregated into WARM
    warmToCold: number; // WARM records aggregated into COLD
    ranAt:      Date;
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export function classifyAge(ageMs: number): RetentionClass {
    const hours = ageMs / 3_600_000;
    if (hours <= HOT_MAX_AGE_HOURS)          return 'HOT';
    const days  = ageMs / 86_400_000;
    if (days  <= WARM_MAX_AGE_DAYS)          return 'WARM';
    return 'COLD';
}

export function shouldPromoteToWarm(timestamp: Date, now: Date): boolean {
    return classifyAge(now.getTime() - timestamp.getTime()) !== 'HOT';
}

export function shouldPromoteToCold(timestamp: Date, now: Date): boolean {
    return classifyAge(now.getTime() - timestamp.getTime()) === 'COLD';
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class RetentionEngine {

    /**
     * Promote HOT records older than HOT_MAX_AGE_HOURS to WARM.
     * Aggregates per (machineId, signalType, tagName, 1-hour bucket) before removing HOT rows.
     * Safety: never touches records still within the HOT window.
     *
     * Bug fix (found via audit): HistorianRecord.value is a string that can
     * hold either numeric telemetry (TEMPERATURE, COUNT, ...) or categorical
     * text (STATUS, ALARM — see schema comment). HistorianService.aggregateRecords
     * silently skips anything parseFloat can't handle. This function used to
     * treat "nothing came back from aggregation" as "nothing to keep" and
     * deleted the source rows anyway with no replacement — permanently
     * destroying status/alarm history the moment it aged past the HOT
     * window, with zero trace. Non-numeric rows are now preserved
     * individually (retentionClass promoted in place, value untouched)
     * instead of being aggregated away or dropped.
     */
    static async promoteHotToWarm(): Promise<number> {
        return RetentionEngine.promote('HOT', 'WARM', HOT_MAX_AGE_HOURS * 3_600_000, WARM_WINDOW_MS);
    }

    /**
     * Promote WARM records older than WARM_MAX_AGE_DAYS to COLD.
     * Aggregates per (machineId, signalType, tagName, 1-day bucket).
     * See promoteHotToWarm's docstring for the non-numeric-record fix.
     */
    static async promoteWarmToCold(): Promise<number> {
        return RetentionEngine.promote('WARM', 'COLD', WARM_MAX_AGE_DAYS * 86_400_000, COLD_WINDOW_MS);
    }

    /** Run full retention cycle: HOT→WARM then WARM→COLD. */
    static async runRetentionCycle(): Promise<RetentionCycleResult> {
        const hotToWarm  = await RetentionEngine.promoteHotToWarm();
        const warmToCold = await RetentionEngine.promoteWarmToCold();
        return { hotToWarm, warmToCold, ranAt: new Date() };
    }

    /**
     * Shared promotion logic for both HOT→WARM and WARM→COLD. Numeric rows
     * (parseFloat-able `value`) within a bucket are aggregated into a single
     * summary record and the originals deleted. Non-numeric rows (STATUS/
     * ALARM text values) can't be meaningfully averaged, so they are kept as
     * individual records — only their retentionClass is promoted — rather
     * than being silently dropped, which is what happened before this fix
     * whenever a bucket had zero numeric rows, or had a mix of numeric and
     * non-numeric rows within the same (machine, signal, tag, bucket) group.
     */
    private static async promote(
        fromClass: RetentionClass,
        toClass: RetentionClass,
        maxAgeMs: number,
        windowMs: number,
    ): Promise<number> {
        const cutoff = new Date(Date.now() - maxAgeMs);

        const eligible = await prisma.historianRecord.findMany({
            where: { retentionClass: fromClass, timestamp: { lt: cutoff } },
            orderBy: { timestamp: 'asc' },
            take: 10_000,
        });
        if (eligible.length === 0) return 0;

        type Key = string;
        const groups = new Map<Key, typeof eligible>();
        for (const r of eligible) {
            const bucket = Math.floor(r.timestamp.getTime() / windowMs) * windowMs;
            const key: Key = `${r.machineId}||${r.signalType}||${r.tagName}||${bucket}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(r);
        }

        const idsToDelete: string[] = [];
        const idsToPromoteInPlace: string[] = [];
        let promotedCount = 0;

        for (const [, rows] of groups) {
            const numericRows = rows.filter(r => !isNaN(parseFloat(r.value)));
            const nonNumericRows = rows.filter(r => isNaN(parseFloat(r.value)));

            if (numericRows.length > 0) {
                const agg = HistorianService.aggregateRecords(
                    numericRows.map(r => ({ timestamp: r.timestamp, value: r.value })),
                    windowMs,
                );
                if (agg.length > 0) {
                    const pt = agg[0];
                    const { machineId, signalType, tagName, source } = numericRows[0];
                    await prisma.historianRecord.create({
                        data: {
                            machineId,
                            signalType,
                            tagName,
                            value:          String(pt.avg),
                            quality:        'GOOD',
                            source,
                            timestamp:      pt.windowStart,
                            retentionClass: toClass,
                        },
                    });
                    idsToDelete.push(...numericRows.map(r => r.id));
                    promotedCount += numericRows.length;
                }
            }

            if (nonNumericRows.length > 0) {
                idsToPromoteInPlace.push(...nonNumericRows.map(r => r.id));
                promotedCount += nonNumericRows.length;
            }
        }

        if (idsToDelete.length > 0) {
            await prisma.historianRecord.deleteMany({ where: { id: { in: idsToDelete } } });
        }
        if (idsToPromoteInPlace.length > 0) {
            await prisma.historianRecord.updateMany({
                where: { id: { in: idsToPromoteInPlace } },
                data: { retentionClass: toClass },
            });
        }

        return promotedCount;
    }
}
