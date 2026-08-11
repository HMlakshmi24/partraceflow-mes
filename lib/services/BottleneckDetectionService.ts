import { prisma } from '@/lib/services/database'
import { eventBus } from '@/lib/events/EventBus'

export interface BottleneckResult {
  machineId: string
  machineName: string
  utilizationPercent: number
  queueLength: number
  avgWaitTimeMinutes: number
  throughputPerHour: number
  isBottleneck: boolean
  bottleneckScore: number // 0-100, higher = more of a bottleneck
  recommendation: string
}

export interface LineAnalysis {
  productionLineId?: string
  analysisDate: Date
  machines: BottleneckResult[]
  primaryBottleneck: BottleneckResult | null
  lineThrottlePercent: number
  estimatedCapacityLoss: number
}

// Bottleneck-score weighting: utilization dominates, queue length contributes
// on a capped scale so one extreme outlier machine can't skew the score.
const UTILIZATION_SCORE_WEIGHT = 0.6
const QUEUE_LENGTH_SCORE_CAP = 20
const QUEUE_LENGTH_SCORE_WEIGHT = 2
const BOTTLENECK_SCORE_THRESHOLD = 70

// A machine also counts as a bottleneck below the score threshold if it's
// both highly utilized and has a real queue forming behind it.
const HIGH_UTILIZATION_THRESHOLD = 85
const HIGH_UTILIZATION_QUEUE_THRESHOLD = 3

// Recommendation-message thresholds.
const CRITICAL_UTILIZATION_THRESHOLD = 90
const QUEUE_BUILDUP_THRESHOLD = 5

const SCAN_PLANT_LOOKBACK_HOURS = 8

export class BottleneckDetectionService {

  static async analyzeProductionLine(
    machineIds: string[],
    fromDate: Date,
    toDate: Date
  ): Promise<LineAnalysis> {
    const periodHours = (toDate.getTime() - fromDate.getTime()) / 3600000
    const results: BottleneckResult[] = []

    for (const machineId of machineIds) {
      const machine = await prisma.machine.findUnique({ where: { id: machineId } })
      if (!machine) continue

      // Completed tasks on this machine
      const completedTasks = await prisma.workflowTask.count({
        where: {
          machineId,
          status: 'COMPLETED',
          endTime: { gte: fromDate, lte: toDate }
        }
      })

      // Pending/in-progress tasks (queue)
      const queueLength = await prisma.workflowTask.count({
        where: {
          machineId,
          status: { in: ['PENDING', 'IN_PROGRESS'] }
        }
      })

      // Average task duration
      const tasks = await prisma.workflowTask.findMany({
        where: {
          machineId,
          status: 'COMPLETED',
          startTime: { not: null },
          endTime: { gte: fromDate, lte: toDate },
        },
        select: { startTime: true, endTime: true },
        take: 1000,
      })

      const avgDurationMinutes = tasks.length > 0
        ? tasks.reduce((sum, t) => {
            if (!t.startTime || !t.endTime) return sum
            return sum + (t.endTime.getTime() - t.startTime.getTime()) / 60000
          }, 0) / tasks.length
        : 0

      // Downtime
      const downtime = await prisma.downtimeEvent.aggregate({
        where: { machineId, startTime: { gte: fromDate, lte: toDate }, status: 'CLOSED' },
        _sum: { durationMinutes: true }
      })
      const downtimeMinutes = downtime._sum.durationMinutes ?? 0

      const availableMinutes = periodHours * 60 - downtimeMinutes
      const busyMinutes = completedTasks * avgDurationMinutes
      const utilizationPercent = availableMinutes > 0
        ? Math.min(100, (busyMinutes / availableMinutes) * 100)
        : 0

      const throughputPerHour = periodHours > 0 ? completedTasks / periodHours : 0

      // Bottleneck score: high utilization + long queue = bottleneck
      const bottleneckScore = (utilizationPercent * UTILIZATION_SCORE_WEIGHT) + (Math.min(queueLength, QUEUE_LENGTH_SCORE_CAP) * QUEUE_LENGTH_SCORE_WEIGHT)
      const isBottleneck = bottleneckScore > BOTTLENECK_SCORE_THRESHOLD || (utilizationPercent > HIGH_UTILIZATION_THRESHOLD && queueLength > HIGH_UTILIZATION_QUEUE_THRESHOLD)

      let recommendation = 'Machine is performing normally.'
      if (isBottleneck) {
        if (utilizationPercent > CRITICAL_UTILIZATION_THRESHOLD) {
          recommendation = `Critical bottleneck: ${machine.name} is at ${utilizationPercent.toFixed(0)}% utilization. Consider adding capacity or redistributing work.`
        } else if (queueLength > QUEUE_BUILDUP_THRESHOLD) {
          recommendation = `Queue buildup on ${machine.name}: ${queueLength} jobs waiting. Review scheduling or increase throughput.`
        }
      }

      results.push({
        machineId,
        machineName: machine.name,
        utilizationPercent,
        queueLength,
        avgWaitTimeMinutes: queueLength * avgDurationMinutes,
        throughputPerHour,
        isBottleneck,
        bottleneckScore,
        recommendation
      })
    }

    // Sort by bottleneck score
    results.sort((a, b) => b.bottleneckScore - a.bottleneckScore)
    const primaryBottleneck = results.find(r => r.isBottleneck) ?? null

    // Overall line throttle: the bottleneck limits the whole line
    const lineThrottlePercent = primaryBottleneck
      ? Math.max(0, primaryBottleneck.utilizationPercent - HIGH_UTILIZATION_THRESHOLD)
      : 0
    const estimatedCapacityLoss = (lineThrottlePercent / 100) *
      results.reduce((sum, r) => sum + r.throughputPerHour, 0) / results.length

    if (primaryBottleneck) {
      eventBus.publish({
        type: 'bottleneck.detected',
        source: 'BottleneckDetectionService',
        machineId: primaryBottleneck.machineId,
        payload: {
          machineName: primaryBottleneck.machineName,
          score: primaryBottleneck.bottleneckScore,
          utilization: primaryBottleneck.utilizationPercent,
          queueLength: primaryBottleneck.queueLength
        }
      })
    }

    return {
      analysisDate: new Date(),
      machines: results,
      primaryBottleneck,
      lineThrottlePercent,
      estimatedCapacityLoss
    }
  }

  // Quick plant-wide bottleneck scan
  static async scanPlant(plantId?: string): Promise<BottleneckResult[]> {
    const machines = await prisma.machine.findMany({
      where: plantId
        ? { productionLine: { area: { plant: { id: plantId } } } }
        : undefined,
      take: 200,
    })

    const toDate = new Date()
    const fromDate = new Date(toDate.getTime() - SCAN_PLANT_LOOKBACK_HOURS * 3600000)

    const analysis = await this.analyzeProductionLine(
      machines.map(m => m.id),
      fromDate,
      toDate
    )

    return analysis.machines.filter(m => m.isBottleneck)
  }
}
