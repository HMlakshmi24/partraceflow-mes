/**
 * GET /api/trends
 *
 * Unified historical trend endpoint.
 *
 * Query params:
 *   type        required  oee | downtime | alarms | throughput | runtime
 *   machineId   required  target machine (or 'all' for fleet)
 *   from        required  ISO-8601 start datetime
 *   to          required  ISO-8601 end datetime
 *   window      optional  hour | day | week  (default: hour)
 *   page        optional  1-based page number (default: 1)
 *   pageSize    optional  max 500 (default: 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { HistorianService } from '@/lib/services/HistorianService';

type TrendType = 'oee' | 'downtime' | 'alarms' | 'throughput' | 'runtime';
type Window    = 'hour' | 'day' | 'week';

const WINDOW_MS: Record<Window, number> = {
    hour:  3_600_000,
    day:   86_400_000,
    week:  604_800_000,
};

function parseRange(from: string | null, to: string | null): { from: Date; to: Date } | null {
    if (!from || !to) return null;
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
    if (f >= t) return null;
    return { from: f, to: t };
}

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'PLANNER', 'MAINTENANCE', 'QC', 'QUALITY']);
    if (authError) return authError;

    const sp       = new URL(req.url).searchParams;
    const type     = sp.get('type') as TrendType | null;
    const machineId = sp.get('machineId');
    const windowKey = (sp.get('window') ?? 'hour') as Window;
    const page     = Math.max(1, parseInt(sp.get('page')     ?? '1')   || 1);
    const pageSize = Math.min(500, parseInt(sp.get('pageSize') ?? '200') || 200);

    const validTypes: TrendType[] = ['oee', 'downtime', 'alarms', 'throughput', 'runtime'];
    if (!type || !validTypes.includes(type)) {
        return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }
    if (!machineId) return NextResponse.json({ error: 'machineId required' }, { status: 400 });
    if (!WINDOW_MS[windowKey]) return NextResponse.json({ error: 'window must be hour | day | week' }, { status: 400 });

    const range = parseRange(sp.get('from'), sp.get('to'));
    if (!range) return NextResponse.json({ error: 'from and to must be valid ISO-8601 datetimes with from < to' }, { status: 400 });

    const windowMs = WINDOW_MS[windowKey];
    const offset   = (page - 1) * pageSize;

    try {
        let data: unknown[];
        let total = 0;

        switch (type) {
            case 'oee': {
                const snapshots = await prisma.oEESnapshot.findMany({
                    where: {
                        machineId,
                        periodStart: { gte: range.from, lte: range.to },
                    },
                    orderBy: { periodStart: 'asc' },
                    skip:  offset,
                    take:  pageSize,
                });
                total = await prisma.oEESnapshot.count({
                    where: { machineId, periodStart: { gte: range.from, lte: range.to } },
                });
                data = snapshots.map(s => ({
                    timestamp:    s.periodStart,
                    oee:          s.oee,
                    availability: s.availability,
                    performance:  s.performance,
                    quality:      s.quality,
                }));
                break;
            }

            case 'downtime': {
                const events = await prisma.downtimeEvent.findMany({
                    where: { machineId, startTime: { gte: range.from, lte: range.to } },
                    include: { reason: { select: { name: true } } },
                    orderBy: { startTime: 'asc' },
                    skip:  offset,
                    take:  pageSize,
                });
                total = await prisma.downtimeEvent.count({
                    where: { machineId, startTime: { gte: range.from, lte: range.to } },
                });
                // Bucket into windows
                const buckets = new Map<number, { durationSeconds: number; count: number }>();
                for (const e of events) {
                    const bucket = Math.floor(e.startTime.getTime() / windowMs) * windowMs;
                    const prev = buckets.get(bucket) ?? { durationSeconds: 0, count: 0 };
                    buckets.set(bucket, {
                        durationSeconds: prev.durationSeconds + (e.durationSeconds ?? 0),
                        count: prev.count + 1,
                    });
                }
                data = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([ts, v]) => ({
                    timestamp:       new Date(ts),
                    durationSeconds: Math.round(v.durationSeconds),
                    durationMinutes: Math.round(v.durationSeconds / 60),
                    count:           v.count,
                }));
                break;
            }

            case 'alarms': {
                const alarms = await prisma.alarmEvent.findMany({
                    where: { machineId, startTime: { gte: range.from, lte: range.to } },
                    orderBy: { startTime: 'asc' },
                    skip:  offset,
                    take:  pageSize,
                });
                total = await prisma.alarmEvent.count({
                    where: { machineId, startTime: { gte: range.from, lte: range.to } },
                });
                const buckets = new Map<number, { count: number; bySeverity: Record<string, number> }>();
                for (const a of alarms) {
                    const bucket = Math.floor(a.startTime.getTime() / windowMs) * windowMs;
                    const prev = buckets.get(bucket) ?? { count: 0, bySeverity: {} };
                    prev.count += 1;
                    prev.bySeverity[a.severity] = (prev.bySeverity[a.severity] ?? 0) + 1;
                    buckets.set(bucket, prev);
                }
                data = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([ts, v]) => ({
                    timestamp:  new Date(ts),
                    count:      v.count,
                    bySeverity: v.bySeverity,
                }));
                break;
            }

            case 'throughput': {
                const points = await HistorianService.aggregate(
                    { machineId, from: range.from, to: range.to, signalType: 'COUNT', limit: 100_000 },
                    windowMs,
                );
                const sliced = points.slice(offset, offset + pageSize);
                total = points.length;
                data  = sliced.map(p => ({
                    timestamp:   p.windowStart,
                    partsPerHour: Math.round(p.avg * (3_600_000 / windowMs) * 10) / 10,
                    total:        Math.round(p.avg * p.count),
                    count:        p.count,
                }));
                break;
            }

            case 'runtime': {
                const points = await HistorianService.aggregate(
                    { machineId, from: range.from, to: range.to, signalType: 'COUNT', limit: 100_000 },
                    windowMs,
                );
                // Fall back to OEE snapshots for runtime trend when no historian records exist
                const snapshots = await prisma.oEESnapshot.findMany({
                    where: { machineId, periodStart: { gte: range.from, lte: range.to } },
                    orderBy: { periodStart: 'asc' },
                    skip:  offset,
                    take:  pageSize,
                });
                total = await prisma.oEESnapshot.count({
                    where: { machineId, periodStart: { gte: range.from, lte: range.to } },
                });
                data = snapshots.map(s => ({
                    timestamp:       s.periodStart,
                    runtimeSeconds:  s.runtimeSeconds,
                    downtimeSeconds: s.downtimeSeconds,
                    utilization:     s.plannedSeconds > 0
                        ? Math.round((s.runtimeSeconds / s.plannedSeconds) * 1000) / 10
                        : 0,
                }));
                break;
            }

            default:
                return NextResponse.json({ error: 'Unknown trend type' }, { status: 400 });
        }

        return NextResponse.json({
            type,
            machineId,
            window:   windowKey,
            period:   { from: range.from, to: range.to },
            page,
            pageSize,
            total,
            data,
        });
    } catch (err) {
                return handleApiError('[GET /api/trends]', err);
    }
}
