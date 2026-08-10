import { prisma } from '@/lib/services/database';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConflictType =
    | 'MACHINE_OVERBOOKED'
    | 'SHIFT_OVERBOOKED'
    | 'MAINTENANCE_CONFLICT'
    | 'MACHINE_DOWN'
    | 'CAPABILITY_MISMATCH';

export interface ShiftWindow {
    name:       string;
    startHour:  number;
    startMin:   number;
    endHour:    number;
    endMin:     number;
}

export interface MaintenanceWindow {
    start: string; // ISO-8601
    end:   string;
    label?: string;
}

export interface SlotCandidate {
    start: Date;
    end:   Date;
}

export interface ScheduleResult {
    success:   boolean;
    scheduleId?: string;
    plannedStart?: Date;
    plannedEnd?:   Date;
    machineId?:    string;
    estimatedDurationMinutes?: number;
    conflicts: Array<{ type: ConflictType; description: string; isBlocking: boolean }>;
    error?:    string;
}

// ── Pure formula functions (exported for unit tests) ──────────────────────────

/** Duration in minutes to produce `quantity` units at `capacityPerHour` units/hour. */
export function calcScheduledDuration(quantity: number, capacityPerHour: number): number {
    if (capacityPerHour <= 0 || quantity <= 0) return 0;
    return (quantity / capacityPerHour) * 60;
}

/** True when interval [a.start, a.end) overlaps [b.start, b.end). */
export function detectOverlap(
    a: { start: Date; end: Date },
    b: { start: Date; end: Date },
): boolean {
    return a.start < b.end && a.end > b.start;
}

/** True when `date` falls on one of the `workingDays` (0=Sun … 6=Sat). */
export function isWorkingDay(date: Date, workingDays: number[]): boolean {
    return workingDays.includes(date.getDay());
}

/** True when `datetime` falls within at least one shift window (UTC-based). */
export function isInShiftWindow(datetime: Date, shifts: ShiftWindow[]): boolean {
    const h = datetime.getUTCHours();
    const m = datetime.getUTCMinutes();
    const totalMin = h * 60 + m;
    return shifts.some(s => {
        const start = s.startHour * 60 + s.startMin;
        const end   = s.endHour   * 60 + s.endMin;
        if (end > start) return totalMin >= start && totalMin < end;
        // Overnight shift (e.g., 22:00 – 06:00)
        return totalMin >= start || totalMin < end;
    });
}

/** True when [start, end) overlaps any maintenance window. */
export function hasMaintConflict(
    start: Date,
    end:   Date,
    windows: MaintenanceWindow[],
): boolean {
    return windows.some(w => detectOverlap(
        { start, end },
        { start: new Date(w.start), end: new Date(w.end) },
    ));
}

/**
 * Schedule adherence 0-100.
 * 100 = finished exactly on time or early; lower if late.
 */
export function calcAdherence(plannedMinutes: number, actualMinutes: number): number {
    if (plannedMinutes <= 0) return 0;
    if (actualMinutes <= 0)  return 100;
    const ratio = plannedMinutes / actualMinutes;
    return Math.min(100, Math.round(ratio * 1000) / 10);
}

/** Positive drift (minutes late) when actual is beyond plannedEnd. */
export function calcDrift(plannedEnd: Date, now: Date): number {
    const ms = now.getTime() - plannedEnd.getTime();
    return ms > 0 ? Math.round(ms / 60_000) : 0;
}

/** Capacity utilization 0-100: `usedMinutes` as a % of `availableMinutes`. */
export function calcCapacityUtilization(usedMinutes: number, availableMinutes: number): number {
    if (availableMinutes <= 0) return 0;
    return Math.min(100, Math.round((usedMinutes / availableMinutes) * 1000) / 10);
}

/**
 * Find the earliest slot of `durationMs` on a machine that doesn't overlap
 * any of the `booked` intervals and starts no earlier than `notBefore`.
 */
export function findEarliestSlot(
    notBefore:   Date,
    durationMs:  number,
    booked:      Array<{ start: Date; end: Date }>,
): SlotCandidate {
    const sorted = [...booked].sort((a, b) => a.start.getTime() - b.start.getTime());
    let cursor = notBefore.getTime();

    for (const slot of sorted) {
        const candidateEnd = cursor + durationMs;
        if (candidateEnd <= slot.start.getTime()) break; // fits before this booking
        if (cursor < slot.end.getTime()) cursor = slot.end.getTime(); // push past booking
    }

    return { start: new Date(cursor), end: new Date(cursor + durationMs) };
}

// ── DB-backed scheduler ───────────────────────────────────────────────────────

export class SchedulerService {

    /**
     * Schedule a work order against finite machine capacity.
     * If `machineId` is omitted, the engine selects the first capable machine.
     */
    static async schedule(
        workOrderId: string,
        machineId?: string,
        notBefore?: Date,
    ): Promise<ScheduleResult> {
        const conflicts: ScheduleResult['conflicts'] = [];

        // 1. Load work order
        const wo = await prisma.workOrder.findUnique({
            where: { id: workOrderId },
            include: { product: { select: { sku: true } } },
        });
        if (!wo) return { success: false, conflicts, error: `WorkOrder ${workOrderId} not found` };
        if (['COMPLETED', 'CANCELLED'].includes(wo.status)) {
            return { success: false, conflicts, error: `WorkOrder status ${wo.status} cannot be scheduled` };
        }

        const targetMachineId = machineId ?? wo.machineId ?? undefined;

        // 2. Find capable machine(s)
        const capabilityWhere = targetMachineId
            ? { machineId: targetMachineId, enabled: true }
            : { enabled: true };

        const capabilities = await prisma.machineCapability.findMany({
            where: {
                ...capabilityWhere,
                OR: [
                    { productCode: null },
                    { productCode: wo.product.sku },
                ],
            },
            include: { machine: { select: { id: true, status: true } } },
        });

        if (capabilities.length === 0) {
            conflicts.push({
                type: 'CAPABILITY_MISMATCH',
                description: `No capable machine found for product ${wo.product.sku}`,
                isBlocking: true,
            });
            await SchedulerService._persistConflicts(workOrderId, targetMachineId ?? null, conflicts);
            return { success: false, conflicts, error: 'No capable machine' };
        }

        // 3. Pick first available non-DOWN machine
        const selectedCap = capabilities.find(c => !['DOWN', 'MAINTENANCE'].includes(c.machine.status));
        if (!selectedCap) {
            const downStatuses = [...new Set(capabilities.map(c => c.machine.status))];
            conflicts.push({
                type: 'MACHINE_DOWN',
                description: `All capable machines are ${downStatuses.join('/')}`,
                isBlocking: true,
            });
            await SchedulerService._persistConflicts(workOrderId, targetMachineId ?? null, conflicts);
            return { success: false, conflicts, error: 'All capable machines unavailable' };
        }

        // 4. Calculate required duration
        const durationMinutes = calcScheduledDuration(wo.quantity, selectedCap.maxCapacityPerHour);
        const durationMs      = durationMinutes * 60_000;
        const from            = notBefore ?? new Date();

        // 5-9. Read existing bookings, pick a slot, and create the schedule
        // inside a single Serializable transaction (HIGH-4 fix). Without
        // this, two concurrent schedule() calls for the same machine can
        // both read the same "existing" bookings, independently compute the
        // same "earliest free slot", and both succeed — double-booking the
        // machine, which defeats the point of finite-capacity scheduling.
        // Serializable isolation makes Postgres abort one of the two
        // transactions with a write-conflict error (caught below) instead.
        let slot: SlotCandidate;
        let schedule: { id: string };
        try {
            const result = await prisma.$transaction(async (tx) => {
                const existing = await tx.productionSchedule.findMany({
                    where: {
                        machineId: selectedCap.machineId,
                        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
                        plannedEnd: { gte: from },
                    },
                    select: { plannedStart: true, plannedEnd: true },
                    orderBy: { plannedStart: 'asc' },
                });

                // Bug fix (found via audit): this app has two independent
                // scheduling subsystems — this one (ProductionSchedule) and
                // SchedulingEngine (ScheduledJob), see CLAUDE.md's "two
                // competing scheduling subsystems". This booking used to
                // only look at ProductionSchedule's existing bookings for
                // the machine, so a slot already committed via the other
                // engine was invisible here and could be double-booked.
                // Folding ScheduledJob's active bookings into the same
                // slot-finding pass closes that without merging the two
                // subsystems.
                const existingJobs = await tx.scheduledJob.findMany({
                    where: {
                        machineId: selectedCap.machineId,
                        status: { in: ['SCHEDULED', 'IN_PROGRESS', 'RESCHEDULED'] },
                        scheduledEnd: { gte: from },
                    },
                    select: { scheduledStart: true, scheduledEnd: true },
                });

                const foundSlot = findEarliestSlot(
                    from,
                    durationMs,
                    [
                        ...existing.map(e => ({ start: e.plannedStart, end: e.plannedEnd })),
                        ...existingJobs.map(j => ({ start: j.scheduledStart, end: j.scheduledEnd })),
                    ],
                );

                const created = await tx.productionSchedule.create({
                    data: {
                        workOrderId,
                        machineId: selectedCap.machineId,
                        plannedStart: foundSlot.start,
                        plannedEnd:   foundSlot.end,
                        estimatedDurationMinutes: durationMinutes,
                        status: 'SCHEDULED',
                    },
                });

                if (!wo.scheduledStart) {
                    await tx.workOrder.update({
                        where: { id: workOrderId },
                        data: { scheduledStart: foundSlot.start, scheduledEnd: foundSlot.end },
                    });
                }

                return { slot: foundSlot, schedule: created };
            }, { isolationLevel: 'Serializable' });
            slot = result.slot;
            schedule = result.schedule;
        } catch (e: any) {
            if (e?.code === 'P2034') {
                return { success: false, conflicts, error: 'Scheduling conflict — another request booked this machine concurrently. Please retry.' };
            }
            throw e;
        }

        // 7. Check maintenance window conflicts (informational — not part of
        // the atomic booking above, so it can safely run after commit)
        const calendar = await prisma.productionCalendar.findFirst({
            where: { isActive: true, calendarType: { in: ['PLANT', 'MACHINE'] } },
        });
        if (calendar?.maintenanceWindows) {
            const windows: MaintenanceWindow[] = JSON.parse(calendar.maintenanceWindows);
            if (hasMaintConflict(slot.start, slot.end, windows)) {
                conflicts.push({
                    type: 'MAINTENANCE_CONFLICT',
                    description: `Slot ${slot.start.toISOString()} – ${slot.end.toISOString()} overlaps a maintenance window`,
                    isBlocking: false,
                });
            }
        }

        if (conflicts.length > 0) {
            await SchedulerService._persistConflicts(workOrderId, selectedCap.machineId, conflicts);
        }

        return {
            success: true,
            scheduleId: schedule.id,
            plannedStart: slot.start,
            plannedEnd:   slot.end,
            machineId: selectedCap.machineId,
            estimatedDurationMinutes: durationMinutes,
            conflicts,
        };
    }

    /** Total scheduled minutes for a machine in a time window. */
    static async getScheduledLoad(machineId: string, from: Date, to: Date): Promise<number> {
        const schedules = await prisma.productionSchedule.findMany({
            where: {
                machineId,
                status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
                plannedStart: { lt: to },
                plannedEnd:   { gt: from },
            },
            select: { plannedStart: true, plannedEnd: true },
        });

        return schedules.reduce((sum, s) => {
            const clippedStart = Math.max(s.plannedStart.getTime(), from.getTime());
            const clippedEnd   = Math.min(s.plannedEnd.getTime(), to.getTime());
            return sum + Math.max(0, clippedEnd - clippedStart) / 60_000;
        }, 0);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private static async _persistConflicts(
        workOrderId: string,
        machineId: string | null,
        conflicts: ScheduleResult['conflicts'],
    ): Promise<void> {
        for (const c of conflicts) {
            await prisma.schedulingConflict.create({
                data: {
                    workOrderId,
                    machineId: machineId ?? undefined,
                    conflictType: c.type,
                    severity:     c.isBlocking ? 'CRITICAL' : 'WARNING',
                    description:  c.description,
                    isBlocking:   c.isBlocking,
                },
            });
        }
    }
}
