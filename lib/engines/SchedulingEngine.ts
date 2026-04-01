import { prisma } from '@/lib/services/database'

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

  static async optimizeSchedule(input: SchedulingInput): Promise<SchedulingResult> {
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

    // Simple Earliest Due Date (EDD) with machine capacity constraints
    const machineSchedules = new Map<string, Date>()
    machines.forEach(m => machineSchedules.set(m.id, input.fromDate))

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
        console.warn(`[Scheduler] WO ${wo.orderNumber} will be late`)
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
