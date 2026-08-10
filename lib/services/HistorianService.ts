import { prisma } from '@/lib/services/database';

export type HistorianQuality  = 'GOOD' | 'BAD' | 'UNCERTAIN';
export type HistorianSource   = 'MQTT' | 'OPCUA' | 'EDGE_DEVICE' | 'SYSTEM';
export type RetentionClass    = 'HOT'  | 'WARM'  | 'COLD';

export interface HistorianInput {
    machineId:      string;
    signalType:     string;
    tagName:        string;
    value:          string | number | boolean;
    quality?:       HistorianQuality;
    source:         HistorianSource;
    timestamp?:     Date;
    retentionClass?: RetentionClass;
}

export interface HistorianQueryOptions {
    machineId:       string;
    from:            Date;
    to:              Date;
    signalType?:     string;
    tagName?:        string;
    quality?:        HistorianQuality;
    retentionClass?: RetentionClass;
    limit?:          number;
    offset?:         number;
}

export interface AggregatedPoint {
    windowStart: Date;
    windowEnd:   Date;
    avg:         number;
    min:         number;
    max:         number;
    count:       number;
    quality:     HistorianQuality;
}

export class HistorianService {

    // ── Write (append-only) ───────────────────────────────────────────────────

    static async record(input: HistorianInput): Promise<void> {
        await prisma.historianRecord.create({
            data: {
                machineId:      input.machineId,
                signalType:     input.signalType,
                tagName:        input.tagName,
                value:          String(input.value),
                quality:        input.quality        ?? 'GOOD',
                source:         input.source,
                timestamp:      input.timestamp      ?? new Date(),
                retentionClass: input.retentionClass ?? 'HOT',
            },
        });
    }

    static async recordBatch(inputs: HistorianInput[]): Promise<void> {
        if (inputs.length === 0) return;
        await prisma.historianRecord.createMany({
            data: inputs.map(i => ({
                machineId:      i.machineId,
                signalType:     i.signalType,
                tagName:        i.tagName,
                value:          String(i.value),
                quality:        i.quality        ?? 'GOOD',
                source:         i.source,
                timestamp:      i.timestamp      ?? new Date(),
                retentionClass: i.retentionClass ?? 'HOT',
            })),
        });
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    static async query(opts: HistorianQueryOptions) {
        return prisma.historianRecord.findMany({
            where: {
                machineId: opts.machineId,
                timestamp: { gte: opts.from, lte: opts.to },
                ...(opts.signalType     ? { signalType:     opts.signalType }     : {}),
                ...(opts.tagName        ? { tagName:        opts.tagName }        : {}),
                ...(opts.quality        ? { quality:        opts.quality }        : {}),
                ...(opts.retentionClass ? { retentionClass: opts.retentionClass } : {}),
            },
            orderBy: { timestamp: 'asc' },
            take:    opts.limit  ?? 1000,
            skip:    opts.offset ?? 0,
        });
    }

    static async count(machineId: string, from: Date, to: Date, retentionClass?: RetentionClass): Promise<number> {
        return prisma.historianRecord.count({
            where: {
                machineId,
                timestamp: { gte: from, lte: to },
                ...(retentionClass ? { retentionClass } : {}),
            },
        });
    }

    // ── Aggregation ───────────────────────────────────────────────────────────

    static async aggregate(opts: HistorianQueryOptions, windowMs: number): Promise<AggregatedPoint[]> {
        const records = await HistorianService.query({ ...opts, limit: Math.min(opts.limit ?? 10_000, 10_000) });
        return HistorianService.aggregateRecords(
            records.map(r => ({ timestamp: r.timestamp, value: r.value })),
            windowMs,
        );
    }

    /** Pure in-memory aggregation — also used by RetentionEngine. */
    static aggregateRecords(
        records: Array<{ timestamp: Date; value: string }>,
        windowMs: number,
    ): AggregatedPoint[] {
        const windows = new Map<number, number[]>();
        for (const r of records) {
            const val = parseFloat(r.value);
            if (isNaN(val)) continue;
            const bucket = Math.floor(r.timestamp.getTime() / windowMs) * windowMs;
            if (!windows.has(bucket)) windows.set(bucket, []);
            windows.get(bucket)!.push(val);
        }
        return Array.from(windows.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([ts, vals]) => ({
                windowStart: new Date(ts),
                windowEnd:   new Date(ts + windowMs),
                avg:  vals.reduce((s, v) => s + v, 0) / vals.length,
                min:  Math.min(...vals),
                max:  Math.max(...vals),
                count: vals.length,
                quality: 'GOOD' as HistorianQuality,
            }));
    }
}
