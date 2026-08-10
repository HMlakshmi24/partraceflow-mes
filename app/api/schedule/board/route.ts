/**
 * GET /api/schedule/board
 *
 * Aggregated snapshot for the Gantt dispatch board:
 *   machines, schedules (with conflicts + delay flag), active conflicts,
 *   first active PLANT calendar (shifts + maintenance windows),
 *   per-machine utilization for the requested period.
 *
 * Query params:
 *   from  â€” ISO datetime, default = start of current hour
 *   to    â€” ISO datetime, default = from + 24 h
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'MAINTENANCE']);
    if (authError) return authError;

    const sp = new URL(req.url).searchParams;

    const now   = new Date();
    const defFrom = new Date(now);
    defFrom.setMinutes(0, 0, 0);

    const from = sp.get('from') ? new Date(sp.get('from')!) : defFrom;
    const to   = sp.get('to')   ? new Date(sp.get('to')!)   : new Date(from.getTime() + 24 * 3_600_000);

    try {
        const [machines, schedules, conflicts, calendar] = await Promise.all([
            prisma.machine.findMany({
                select: { id: true, code: true, name: true, status: true },
                orderBy: { code: 'asc' },
            }),
            prisma.productionSchedule.findMany({
                where: {
                    plannedStart: { lte: to },
                    plannedEnd:   { gte: from },
                    status:       { not: 'CANCELLED' },
                },
                include: {
                    workOrder: {
                        select: {
                            id: true, orderNumber: true,
                            quantity: true, dueDate: true, status: true,
                        },
                    },
                    machine: { select: { id: true, code: true, name: true, status: true } },
                },
                orderBy: { plannedStart: 'asc' },
                take: 500,
            }),
            prisma.schedulingConflict.findMany({
                where: { resolvedAt: null },
                select: {
                    id: true, machineId: true, workOrderId: true,
                    conflictType: true, severity: true, description: true,
                    isBlocking: true, detectedAt: true,
                },
                orderBy: { detectedAt: 'desc' },
                take: 200,
            }),
            prisma.productionCalendar.findFirst({
                where: { isActive: true, calendarType: 'PLANT' },
                select: {
                    id: true, name: true,
                    workingDays: true, shiftPattern: true,
                    maintenanceWindows: true, timezone: true,
                },
            }),
        ]);

        // Index conflicts by workOrderId and machineId for O(1) lookup
        const conflictsByWO      = new Map<string, typeof conflicts>();
        const conflictsByMachine = new Map<string, typeof conflicts>();

        for (const c of conflicts) {
            if (c.workOrderId) {
                const arr = conflictsByWO.get(c.workOrderId) ?? [];
                arr.push(c);
                conflictsByWO.set(c.workOrderId, arr);
            }
            if (c.machineId) {
                const arr = conflictsByMachine.get(c.machineId) ?? [];
                arr.push(c);
                conflictsByMachine.set(c.machineId, arr);
            }
        }

        // Enrich schedules with conflict list and delay flag
        const enrichedSchedules = schedules.map(s => {
            const woConflicts  = s.workOrderId ? (conflictsByWO.get(s.workOrderId)      ?? []) : [];
            const machConflicts = conflictsByMachine.get(s.machineId) ?? [];
            // Deduplicate by id
            const seen = new Set<string>();
            const combined: typeof conflicts = [];
            for (const c of [...woConflicts, ...machConflicts]) {
                if (!seen.has(c.id)) { seen.add(c.id); combined.push(c); }
            }
            const dueDate   = s.workOrder?.dueDate ? new Date(s.workOrder.dueDate) : null;
            const isDelayed = dueDate ? s.plannedEnd > dueDate : false;

            return { ...s, conflicts: combined, isDelayed };
        });

        // Per-machine utilization for the requested period
        const periodMs = to.getTime() - from.getTime();
        const machineUtilization = machines.map(m => {
            let usedMs = 0;
            for (const s of schedules) {
                if (s.machineId !== m.id) continue;
                const start = Math.max(s.plannedStart.getTime(), from.getTime());
                const end   = Math.min(s.plannedEnd.getTime(),   to.getTime());
                if (end > start) usedMs += end - start;
            }
            const pct = periodMs > 0 ? Math.min(100, (usedMs / periodMs) * 100) : 0;
            return { machineId: m.id, utilizationPct: Math.round(pct * 10) / 10 };
        });

        return NextResponse.json({
            machines,
            schedules: enrichedSchedules,
            conflicts,
            calendar,
            machineUtilization,
            period: { from: from.toISOString(), to: to.toISOString() },
        });
    } catch (err) {
                return handleApiError('[GET /api/schedule/board]', err);
    }
}
