import { prisma } from '@/lib/services/database'
import { eventBus } from '@/lib/events/EventBus'

export interface SPCChartData {
  parameterId: string
  parameterName: string
  unit?: string
  centerLine: number
  ucl: number
  lcl: number
  usl?: number  // Upper Spec Limit
  lsl?: number  // Lower Spec Limit
  cp?: number
  cpk?: number
  points: {
    value: number
    measuredAt: Date
    inControl: boolean
    violationType?: string
  }[]
}

export class SPCService {

  // Add a measurement and check for SPC violations
  static async addMeasurement(data: {
    parameterId: string
    value: number
    machineId: string
    taskId?: string
    operatorId?: string
  }) {
    const parameter = await prisma.processParameter.findUnique({
      where: { id: data.parameterId },
      include: {
        controlLimits: { orderBy: { calculatedAt: 'desc' }, take: 1 }
      }
    })
    if (!parameter) throw new Error('Parameter not found')

    const limits = parameter.controlLimits[0]
    let inControl = true
    let violationType: string | undefined

    if (limits) {
      // Nelson Rule 1: Point outside 3-sigma control limits
      if (data.value > limits.ucl || data.value < limits.lcl) {
        inControl = false
        violationType = 'NELSON_RULE_1_3SIGMA'
      }
    }

    // Check spec limits
    if (parameter.upperSpecLimit !== null && data.value > parameter.upperSpecLimit) {
      inControl = false
      violationType = violationType ?? 'ABOVE_UPPER_SPEC'
    }
    if (parameter.lowerSpecLimit !== null && data.value < parameter.lowerSpecLimit) {
      inControl = false
      violationType = violationType ?? 'BELOW_LOWER_SPEC'
    }

    const record = await prisma.sPCRecord.create({
      data: {
        parameterId: data.parameterId,
        value: data.value,
        machineId: data.machineId,
        taskId: data.taskId,
        operatorId: data.operatorId,
        inControl,
        violationType,
        measuredAt: new Date()
      }
    })

    if (!inControl) {
      eventBus.publish({
        type: 'spc.violation',
        source: 'SPCService',
        machineId: data.machineId,
        payload: {
          parameterId: data.parameterId,
          parameterName: parameter.parameterName,
          value: data.value,
          ucl: limits?.ucl,
          lcl: limits?.lcl,
          violationType
        }
      })
    }

    return record
  }

  // Recalculate control limits from recent samples (Western Electric 3-sigma)
  static async recalculateControlLimits(parameterId: string, sampleCount: number = 50) {
    const records = await prisma.sPCRecord.findMany({
      where: { parameterId },
      orderBy: { measuredAt: 'desc' },
      take: sampleCount
    })

    if (records.length < 10) {
      return null // Not enough data
    }

    const values = records.map(r => r.value)
    const n = values.length
    const mean = values.reduce((a, b) => a + b, 0) / n
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1)
    const sigma = Math.sqrt(variance)

    const ucl = mean + 3 * sigma
    const lcl = mean - 3 * sigma

    // Calculate Cp/Cpk if spec limits exist
    const parameter = await prisma.processParameter.findUnique({ where: { id: parameterId } })
    let cp: number | undefined
    let cpk: number | undefined

    if (parameter?.upperSpecLimit !== null && parameter?.lowerSpecLimit !== null
        && parameter?.upperSpecLimit !== undefined && parameter?.lowerSpecLimit !== undefined) {
      cp = (parameter.upperSpecLimit - parameter.lowerSpecLimit) / (6 * sigma)
      const cpkUpper = (parameter.upperSpecLimit - mean) / (3 * sigma)
      const cpkLower = (mean - parameter.lowerSpecLimit) / (3 * sigma)
      cpk = Math.min(cpkUpper, cpkLower)
    }

    const limits = await prisma.controlLimit.create({
      data: {
        parameterId,
        ucl,
        lcl,
        centerLine: mean,
        sigma,
        cp,
        cpk,
        sampleCount: n,
        calculatedAt: new Date()
      }
    })

    // Update parameter with new control limits
    await prisma.processParameter.update({
      where: { id: parameterId },
      data: { upperControlLimit: ucl, lowerControlLimit: lcl }
    })

    return limits
  }

  // Get X-bar chart data for display
  static async getChartData(parameterId: string, points: number = 100): Promise<SPCChartData> {
    const parameter = await prisma.processParameter.findUnique({
      where: { id: parameterId },
      include: {
        controlLimits: { orderBy: { calculatedAt: 'desc' }, take: 1 },
        spcRecords: {
          orderBy: { measuredAt: 'desc' },
          take: points
        }
      }
    })

    if (!parameter) throw new Error('Parameter not found')

    const limits = parameter.controlLimits[0]

    return {
      parameterId,
      parameterName: parameter.parameterName,
      unit: parameter.unit ?? undefined,
      centerLine: limits?.centerLine ?? parameter.nominalValue ?? 0,
      ucl: limits?.ucl ?? (parameter.upperControlLimit ?? 0),
      lcl: limits?.lcl ?? (parameter.lowerControlLimit ?? 0),
      usl: parameter.upperSpecLimit ?? undefined,
      lsl: parameter.lowerSpecLimit ?? undefined,
      cp: limits?.cp ?? undefined,
      cpk: limits?.cpk ?? undefined,
      points: parameter.spcRecords.reverse().map(r => ({
        value: r.value,
        measuredAt: r.measuredAt,
        inControl: r.inControl,
        violationType: r.violationType ?? undefined
      }))
    }
  }
}
