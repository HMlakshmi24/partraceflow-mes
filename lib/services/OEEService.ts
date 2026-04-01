import { prisma } from '@/lib/services/database'
import { DowntimeService } from '@/lib/services/DowntimeService'

export interface OEEResult {
  machineId: string
  machineName: string
  availability: number
  performance: number
  quality: number
  oee: number
  goodQuantity: number
  scrapQuantity: number
  totalDowntimeMinutes: number
  unplannedDowntimeMinutes: number
  plannedDowntimeMinutes: number
  cycleTimeActual: number
  cycleTimeIdeal: number
  periodStart: Date
  periodEnd: Date
}

export class OEEService {

  // Calculate OEE for a machine over a time period
  static async calculateOEE(machineId: string, fromDate: Date, toDate: Date): Promise<OEEResult> {
    const machine = await prisma.machine.findUnique({ where: { id: machineId } })
    if (!machine) throw new Error('Machine not found')

    const downtimeKPIs = await DowntimeService.getKPIs(machineId, fromDate, toDate)
    const periodMinutes = (toDate.getTime() - fromDate.getTime()) / 60000

    // Get completed tasks on this machine
    const tasks = await prisma.workflowTask.findMany({
      where: {
        machineId,
        status: 'COMPLETED',
        endTime: { gte: fromDate, lte: toDate }
      },
      include: { qualityChecks: true }
    })

    // Quality calculation
    const totalParts = tasks.length
    const goodParts = tasks.filter(t =>
      t.qualityChecks.every(qc => qc.result === 'PASS') || t.qualityChecks.length === 0
    ).length
    const qualityRate = totalParts > 0 ? goodParts / totalParts : 1

    // Availability
    const netAvailableTime = periodMinutes - downtimeKPIs.plannedDowntimeMinutes
    const productiveTime = netAvailableTime - downtimeKPIs.unplannedDowntimeMinutes
    const availability = netAvailableTime > 0 ? productiveTime / netAvailableTime : 0

    // Performance (simplified: based on actual vs ideal cycle time)
    const productionLine = await prisma.productionLine.findFirst({
      where: { machines: { some: { id: machineId } } }
    })
    const idealCycleTimeSeconds = productionLine?.targetCycleTime ?? 60
    const actualCycleTimeSeconds = tasks.length > 0 && productiveTime > 0
      ? (productiveTime * 60) / tasks.length
      : idealCycleTimeSeconds
    // When machine is RUNNING but no workflow tasks tracked, estimate 80% performance
    // (machine is producing but task-level tracking isn't configured yet)
    const performance = tasks.length === 0
      ? (machine.status === 'RUNNING' ? 0.80 : 0)
      : (actualCycleTimeSeconds > 0 ? Math.min(1, idealCycleTimeSeconds / actualCycleTimeSeconds) : 0)

    const oee = availability * performance * qualityRate

    // Update machine OEE in database
    await prisma.machine.update({
      where: { id: machineId },
      data: { oee: oee * 100 }
    })

    return {
      machineId,
      machineName: machine.name,
      availability: availability * 100,
      performance: performance * 100,
      quality: qualityRate * 100,
      oee: oee * 100,
      goodQuantity: goodParts,
      scrapQuantity: totalParts - goodParts,
      totalDowntimeMinutes: downtimeKPIs.totalDowntimeMinutes,
      unplannedDowntimeMinutes: downtimeKPIs.unplannedDowntimeMinutes,
      plannedDowntimeMinutes: downtimeKPIs.plannedDowntimeMinutes,
      cycleTimeActual: actualCycleTimeSeconds,
      cycleTimeIdeal: idealCycleTimeSeconds,
      periodStart: fromDate,
      periodEnd: toDate
    }
  }

  // Calculate OEE for all machines in a plant
  static async calculatePlantOEE(plantId: string, fromDate: Date, toDate: Date) {
    const machines = await prisma.machine.findMany({
      where: {
        productionLine: {
          area: {
            plant: { id: plantId }
          }
        }
      }
    })

    const results = await Promise.allSettled(
      machines.map(m => this.calculateOEE(m.id, fromDate, toDate))
    )

    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<OEEResult>).value)
  }
}
