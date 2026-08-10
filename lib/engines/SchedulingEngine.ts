import { prisma } from '@/lib/services/database'
import type { Prisma } from '@prisma/client'
import { createLogger } from '@/lib/logger';

const log = createLogger('SchedulingEngine');

export interface SchedulingInput {
  workOrderIds: string[]
  fromDate: Date
  toDate: Date
  optimizationGoal?: 'MINIMIZE_LATENESS' | 'MAXIMIZE_THROUGHPUT' | 'MINIMIZE_CHANGEOVER'
}

export interface SchedulingResult {
  scheduledJobs: {
    workOrderId: string
    orderNumber: string
    machineId: string
    machineName: string
    scheduledStart: Date
    scheduledEnd: Date
    priority: number
  }[]
  unscheduled: string[]
  kpis: {
    utilizationPercent: number
    onTimeDeliveryPercent: number
    totalSetupMinutes: number
  }
}

export class SchedulingEngine {

  // HIGH-4 fix: two concurrent optimizeSchedule() calls previously read the
  // same machine-availability snapshot and could independently assign
  // overlapping slots on the same machine to different work orders (the
  // in-memory `machineSchedules` map from one call has no visibility into
  // the other call's in-flight decisions). Running the whole batch inside a
  // Serializable transaction makes Postgres detect that conflict and abort
  // one of the two callers instead of silently double-booking.
  static async optimizeSchedule(input: SchedulingInput): Promise<SchedulingResult> {
    try {
      return await prisma.$transaction(
        (tx) => SchedulingEngine._optimizeScheduleTx(input, tx),
        { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 20_000 },
      );
    } catch (e: any) {
      if (e?.code === 'P2034') {
        throw new Error('Scheduling conflict — another optimization run committed concurrently. Please retry.');
      }
      throw e;
    }
  }

  private static async _optimizeScheduleTx(input: SchedulingInput, prisma: Prisma.TransactionClient): Promise<SchedulingResult> {
    const workOrders = await prisma.workOrder.findMany({
      where: { id: { in: input.workOrderIds } },
      include: { product: true },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' }
      ]
    })

    const machines = await prisma.machine.findMany({
      where: { status: { not: 'DOWN' } }
    })

    // Get maintenance windows that block machines
    const maintenanceWindows = await prisma.maintenanceWindow.findMany({
      where: {
        scheduledStart: { gte: input.fromDate },
        scheduledEnd: { lte: input.toDate },
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
      }
    })

    // Bug fix (found via audit): machineSchedules used to be seeded to
    // input.fromDate for every machine unconditionally, ignoring whatever
    // was already committed — both by an earlier, non-overlapping call to
    // THIS engine (ScheduledJob), and by the other, independent scheduler
    // this app has (SchedulerService/ConflictEngine, which writes
    // ProductionSchedule and has zero visibility into ScheduledJob, and
    // vice versa — see CLAUDE.md's "two competing scheduling subsystems").
    // Net effect: every optimize run treated every machine as fully free
    // from fromDate, so it could double-book a machine that either table
    // already had committed for an overlapping window. Seeding from both
    // tables' existing (non-cancelled) commitments closes that gap without
    // merging the two subsystems.
    const machineIds = machines.map(m => m.id)
    const [existingJobs, existingProductionSchedules] = await Promise.all([
      prisma.scheduledJob.findMany({
        where: {
          machineId: { in: machineIds },
          scheduledEnd: { gt: input.fromDate },
          scheduledStart: { lt: input.toDate },
          workOrderId: { notIn: input.workOrderIds }, // this batch's own jobs are about to be recomputed
          status: { not: 'CANCELLED' },
        },
        select: { machineId: true, scheduledEnd: true },
      }),
      prisma.productionSchedule.findMany({
        where: {
          machineId: { in: machineIds },
          plannedEnd: { gt: input.fromDate },
          plannedStart: { lt: input.toDate },
          status: { not: 'CANCELLED' },
        },
        select: { machineId: true, plannedEnd: true },
      }),
    ])

    // Simple Earliest Due Date (EDD) with machine capacity constraints
    const machineSchedules = new Map<string, Date>()
    machines.forEach(m => machineSchedules.set(m.id, input.fromDate))
    for (const job of existingJobs) {
      if (!job.machineId) continue
      const current = machineSchedules.get(job.machineId) ?? input.fromDate
      if (job.scheduledEnd > current) machineSchedules.set(job.machineId, job.scheduledEnd)
    }
    for (const ps of existingProductionSchedules) {
      const current = machineSchedules.get(ps.machineId) ?? input.fromDate
      if (ps.plannedEnd > current) machineSchedules.set(ps.machineId, ps.plannedEnd)
    }

    const scheduledJobs: SchedulingResult['scheduledJobs'] = []
    const unscheduled: string[] = []

    for (const wo of workOrders) {
      // Find available machine (round-robin / earliest available)
      let bestMachine: { id: string; name: string } | null = null
      let earliestStart = new Date(input.toDate)

      for (const machine of machines) {
        const machineAvailableAt = machineSchedules.get(machine.id) ?? input.fromDate

        // Check maintenance windows
        const blockedByMaintenance = maintenanceWindows.some(mw =>
          mw.machineId === machine.id &&
          machineAvailableAt >= mw.scheduledStart &&
          machineAvailableAt <= mw.scheduledEnd
        )
        if (blockedByMaintenance) continue

        if (machineAvailableAt < earliestStart) {
          earliestStart = machineAvailableAt
          bestMachine = { id: machine.id, name: machine.name }
        }
      }

      if (!bestMachine) {
        unscheduled.push(wo.id)
        continue
      }

      // Estimate duration (simplified: 1 minute per unit, min 30 minutes)
      const estimatedMinutes = Math.max(30, wo.quantity * 1)
      const scheduledEnd = new Date(earliestStart.getTime() + estimatedMinutes * 60000)

      // Check if it fits before due date
      if (scheduledEnd > wo.dueDate && input.optimizationGoal === 'MINIMIZE_LATENESS') {
        // Still schedule it, but flag it
        log.warn(`[Scheduler] WO ${wo.orderNumber} will be late`)
      }

      scheduledJobs.push({
        workOrderId: wo.id,
        orderNumber: wo.orderNumber,
        machineId: bestMachine.id,
        machineName: bestMachine.name,
        scheduledStart: new Date(earliestStart),
        scheduledEnd,
        priority: wo.priority
      })

      // Update machine availability
      machineSchedules.set(bestMachine.id, scheduledEnd)

      // Persist to ScheduledJob
      await prisma.scheduledJob.upsert({
        where: { workOrderId: wo.id },
        create: {
          workOrderId: wo.id,
          machineId: bestMachine.id,
          scheduledStart: earliestStart,
          scheduledEnd,
          duration: estimatedMinutes,
          priority: wo.priority,
          status: 'SCHEDULED',
          optimizedAt: new Date()
        },
        update: {
          machineId: bestMachine.id,
          scheduledStart: earliestStart,
          scheduledEnd,
          duration: estimatedMinutes,
          status: 'RESCHEDULED',
          optimizedAt: new Date()
        }
      })
    }

    // Calculate KPIs
    const totalPeriodMinutes = (input.toDate.getTime() - input.fromDate.getTime()) / 60000
    const totalScheduledMinutes = scheduledJobs.reduce((sum, j) =>
      sum + (j.scheduledEnd.getTime() - j.scheduledStart.getTime()) / 60000, 0)
    const utilization = machines.length > 0
      ? (totalScheduledMinutes / (totalPeriodMinutes * machines.length)) * 100
      : 0
    const onTime = workOrders.filter(wo => {
      const job = scheduledJobs.find(j => j.workOrderId === wo.id)
      return job && job.scheduledEnd <= wo.dueDate
    }).length
    const onTimePercent = workOrders.length > 0 ? (onTime / workOrders.length) * 100 : 0

    return {
      scheduledJobs,
      unscheduled,
      kpis: {
        utilizationPercent: utilization,
        onTimeDeliveryPercent: onTimePercent,
        totalSetupMinutes: scheduledJobs.length * 5 // simplified
      }
    }
  }

  static async getSchedule(fromDate: Date, toDate: Date) {
    return prisma.scheduledJob.findMany({
      where: {
        scheduledStart: { gte: fromDate },
        scheduledEnd: { lte: toDate }
      },
      include: {
        workOrder: { include: { product: true } },
        machine: true
      },
      orderBy: { scheduledStart: 'asc' }
    })
  }
}

