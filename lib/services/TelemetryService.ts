import { prisma } from '@/lib/services/database'

export interface TelemetryPoint {
  signalId: string
  machineId: string
  value: string
  quality?: string
  sourceTimestamp?: Date
}

export class TelemetryService {

  // Ingest a batch of telemetry points (called from edge gateway or connectors)
  static async ingestBatch(points: TelemetryPoint[]): Promise<void> {
    if (points.length === 0) return

    await prisma.machineTelemetry.createMany({
      data: points.map(p => ({
        signalId: p.signalId,
        machineId: p.machineId,
        value: p.value,
        quality: p.quality ?? 'GOOD',
        sourceTimestamp: p.sourceTimestamp,
        timestamp: new Date()
      }))
    })

    // Evaluate signal mappings for each signal
    const signalIds = [...new Set(points.map(p => p.signalId))]
    await this.evaluateSignalMappings(points, signalIds)
  }

  // Ingest a single telemetry point
  static async ingest(point: TelemetryPoint): Promise<void> {
    await this.ingestBatch([point])
  }

  // Get latest value for each signal on a machine
  static async getLatestByMachine(machineId: string): Promise<Record<string, { value: string; quality: string; timestamp: Date }>> {
    const signals = await prisma.machineSignal.findMany({
      where: { machineId, isActive: true },
      include: {
        telemetry: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    })

    const result: Record<string, { value: string; quality: string; timestamp: Date }> = {}
    for (const signal of signals) {
      if (signal.telemetry[0]) {
        result[signal.signalName] = {
          value: signal.telemetry[0].value,
          quality: signal.telemetry[0].quality,
          timestamp: signal.telemetry[0].timestamp
        }
      }
    }
    return result
  }

  // Get time-series data for a signal
  static async getTimeSeries(signalId: string, fromTime: Date, toTime: Date) {
    return prisma.machineTelemetry.findMany({
      where: {
        signalId,
        timestamp: { gte: fromTime, lte: toTime }
      },
      orderBy: { timestamp: 'asc' }
    })
  }

  // Evaluate signal mappings — update MES state based on incoming telemetry
  private static async evaluateSignalMappings(points: TelemetryPoint[], signalIds: string[]): Promise<void> {
    const mappings = await prisma.signalMapping.findMany({
      where: { signalId: { in: signalIds }, isActive: true }
    })

    for (const mapping of mappings) {
      const point = points.find(p => p.signalId === mapping.signalId)
      if (!point) continue

      try {
        const transform = mapping.transformRule ? JSON.parse(mapping.transformRule) : null

        if (mapping.mesField === 'machine.status' && transform) {
          let newStatus: string | null = null

          if (transform.type === 'threshold') {
            const numericValue = parseFloat(point.value)
            if (!isNaN(numericValue)) {
              if (transform.above !== undefined && numericValue > transform.above) {
                newStatus = transform.setValue
              } else if (transform.below !== undefined && numericValue < transform.below) {
                newStatus = transform.setValue
              }
            }
          } else if (transform.type === 'map') {
            newStatus = transform.valueMap?.[point.value] ?? null
          }

          if (newStatus) {
            await prisma.machine.update({
              where: { id: point.machineId },
              data: { status: newStatus }
            })
          }
        }
      } catch (e) {
        console.error(`[TelemetryService] Error evaluating mapping ${mapping.id}:`, e)
      }
    }
  }

  // Prune old telemetry data (retention policy)
  static async pruneOldData(retentionDays: number): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    const result = await prisma.machineTelemetry.deleteMany({
      where: { timestamp: { lt: cutoffDate } }
    })
    return result.count
  }
}
