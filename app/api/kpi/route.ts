/**
 * GET /api/kpi
 *
 * KPI calculations derived from historian/runtime data.
 *
 * Query params:
 *   machineId   optional  single machine; omit for fleet aggregate
 *   period      optional  shift | day | week | month  (default: day)
 *   from / to   optional  explicit range (overrides period)
 *   category    optional  include downtime by category (true | false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { KPIEngine } from '@/lib/services/KPIEngine';

type Period = 'shift' | 'day' | 'week' | 'month';

const PERIOD_MS: Record<Period, number> = {
    shift: 8   * 3_600_000,
    day:   24  * 3_600_000,
    week:  7   * 86_400_000,
    month: 30  * 86_400_000,
};

function resolveRange(sp: URLSearchParams): { from: Date; to: Date } {
    const rawFrom = sp.get('from');
    const rawTo   = sp.get('to');
    if (rawFrom && rawTo) {
        const f = new Date(rawFrom);
        const t = new Date(rawTo);
        if (!isNaN(f.getTime()) && !isNaN(t.getTime()) && f < t) return { from: f, to: t };
    }
    const period = (sp.get('period') ?? 'day') as Period;
    const ms = PERIOD_MS[period] ?? PERIOD_MS.day;
    const to   = new Date();
    const from = new Date(to.getTime() - ms);
    return { from, to };
}

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'PLANNER', 'MAINTENANCE', 'QC', 'QUALITY']);
    if (authError) return authError;

    const sp        = new URL(req.url).searchParams;
    const machineId = sp.get('machineId') ?? undefined;
    const withCat   = sp.get('category') === 'true';

    try {
        const { from, to } = resolveRange(sp);

        if (machineId) {
            const kpi = await KPIEngine.calculateForMachine(machineId, from, to);
            const categories = withCat ? await KPIEngine.downtimeByCategory(machineId, from, to) : undefined;
            return NextResponse.json({ period: { from, to }, kpi, ...(categories ? { categories } : {}) });
        }

        // Fleet aggregate
        const machines = await prisma.machine.findMany({ select: { id: true } });
        const ids = machines.map(m => m.id);
        const fleet = await KPIEngine.aggregateFleet(ids, from, to);
        return NextResponse.json({ period: { from, to }, fleet, machineCount: ids.length });

    } catch (err) {
                return handleApiError('[GET /api/kpi]', err);
    }
}
