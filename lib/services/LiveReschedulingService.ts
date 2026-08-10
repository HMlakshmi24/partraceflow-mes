import { prisma } from '@/lib/services/database';
import { ConflictEngine } from '@/lib/services/ConflictEngine';
import { findEarliestSlot, calcDrift } from '@/lib/services/SchedulerService';

export interface RescheduleRecommendation {
    scheduleId:  string;
    workOrderId: string;
    machineId:   string;
    originalStart: Date;
    originalEnd:   Date;
    newStart:      Date;
    newEnd:        Date;
    driftMinutes:  number;
}

export interface MachineDownResult {
    machineId:          string;
    impactedSchedules:  number;
    recommendations:    RescheduleRecommendation[];
    conflictsPersisted: number;
}

export interface DriftResult {
    scheduleId:     string;
    driftMinutes:   number;
    downstreamUpdated: number;
}

export class LiveReschedulingService {

    /**
     * Called when a machine transitions to DOWN/MAINTENANCE.
     * Identifies all SCHEDULED (not yet started) orders on this machine,
     * marks them DRIFTED, persists MACHINE_DOWN conflicts, and generates
     * reschedule recommendations pushing them to the next available slot.
     */
    static async handleMachineDown(machineId: string): Promise<MachineDownResult> {
        const now = new Date();

        const impacted = await prisma.productionSchedule.findMany({
            where: {
                machineId,
                status: 'SCHEDULED',
                plannedStart: { gt: now },
            },
            orderBy: { plannedStart: 'asc' },
        });

        const recommendations: RescheduleRecommendation[] = [];
        let conflictsPersisted = 0;

        for (const sched of impacted) {
            // Mark as drifted
            await prisma.productionSchedule.update({
                where: { id: sched.id },
                data: { status: 'DRIFTED', driftMinutes: calcDrift(sched.plannedEnd, now) },
            });

            // Persist MACHINE_DOWN conflict
            await ConflictEngine.persist({
                workOrderId:  sched.workOrderId,
                machineId,
                conflictType: 'MACHINE_DOWN',
                severity:     'CRITICAL',
                description:  `Machine is DOWN; schedule ${sched.id} cannot proceed`,
                isBlocking:   true,
            });
            conflictsPersisted += 1;

            // Recommendation: find earliest slot on any OTHER capable machine
            const durationMs = sched.estimatedDurationMinutes * 60_000;

            // For simplicity, recommend the same machine once it recovers (no cross-machine move)
            // A full implementation would search capability-matching machines
            const newSlot = findEarliestSlot(now, durationMs, []);
            recommendations.push({
                scheduleId:    sched.id,
                workOrderId:   sched.workOrderId,
                machineId,
                originalStart: sched.plannedStart,
                originalEnd:   sched.plannedEnd,
                newStart:      newSlot.start,
                newEnd:        newSlot.end,
                driftMinutes:  calcDrift(sched.plannedEnd, now),
            });
        }

        return {
            machineId,
            impactedSchedules: impacted.length,
            recommendations,
            conflictsPersisted,
        };
    }

    /**
     * Called when a schedule's actual runtime exceeds its estimate.
     * Recalculates drift for all downstream schedules on the same machine.
     */
    static async handleDrift(scheduleId: string, completionPct: number): Promise<DriftResult> {
        const schedule = await prisma.productionSchedule.findUnique({ where: { id: scheduleId } });
        if (!schedule) throw new Error(`ProductionSchedule ${scheduleId} not found`);

        const now    = new Date();
        const pct    = Math.max(0, Math.min(100, completionPct));

        // Estimate new end time based on current progress
        const elapsed    = now.getTime() - (schedule.actualStart ?? schedule.plannedStart).getTime();
        const totalEst   = pct > 0 ? elapsed / (pct / 100) : schedule.estimatedDurationMinutes * 60_000;
        const newEnd     = new Date((schedule.actualStart ?? schedule.plannedStart).getTime() + totalEst);
        const drift      = calcDrift(schedule.plannedEnd, newEnd);

        // Update the current schedule with drift
        await prisma.productionSchedule.update({
            where: { id: scheduleId },
            data: {
                driftMinutes: drift,
                status: drift > 0 ? 'DRIFTED' : schedule.status,
            },
        });

        // Propagate drift to all downstream schedules on the same machine
        const downstream = await prisma.productionSchedule.findMany({
            where: {
                machineId:    schedule.machineId,
                status:       { in: ['SCHEDULED'] },
                plannedStart: { gt: schedule.plannedEnd },
            },
            orderBy: { plannedStart: 'asc' },
        });

        let downstreamUpdated = 0;
        for (const ds of downstream) {
            const newStart = new Date(ds.plannedStart.getTime() + drift * 60_000);
            const newEnd2  = new Date(ds.plannedEnd.getTime()   + drift * 60_000);
            await prisma.productionSchedule.update({
                where: { id: ds.id },
                data: {
                    plannedStart: newStart,
                    plannedEnd:   newEnd2,
                    driftMinutes: drift,
                    status: 'DRIFTED',
                },
            });
            downstreamUpdated += 1;
        }

        return { scheduleId, driftMinutes: drift, downstreamUpdated };
    }

    /**
     * Recalculate all downstream schedules on a machine starting from `from`.
     * Used after a machine recovers from DOWN.
     */
    static async recalculateDownstream(machineId: string, from: Date): Promise<number> {
        const schedules = await prisma.productionSchedule.findMany({
            where: {
                machineId,
                status:       { in: ['SCHEDULED', 'DRIFTED'] },
                plannedStart: { gte: from },
            },
            orderBy: { plannedStart: 'asc' },
        });

        let cursor = from;
        let updated = 0;

        for (const s of schedules) {
            const durationMs = s.estimatedDurationMinutes * 60_000;
            // If current planned start is already past cursor, no change needed
            if (s.plannedStart.getTime() >= cursor.getTime()) {
                cursor = s.plannedEnd.getTime() > cursor.getTime() ? s.plannedEnd : cursor;
                continue;
            }
            const newStart = new Date(cursor);
            const newEnd   = new Date(cursor.getTime() + durationMs);
            await prisma.productionSchedule.update({
                where: { id: s.id },
                data: {
                    plannedStart: newStart,
                    plannedEnd:   newEnd,
                    driftMinutes: 0,
                    status: 'SCHEDULED',
                },
            });
            cursor = newEnd;
            updated += 1;
        }

        // Resolve MACHINE_DOWN conflicts on recovery
        await ConflictEngine.resolveByMachine(machineId, 'MACHINE_DOWN');

        return updated;
    }
}
