import { prisma } from '@/lib/services/database'

export class TraceabilityService {

  static async createLot(data: {
    lotNumber: string
    productId: string
    quantity: number
    unit?: string
    supplierId?: string
    expiryDate?: Date
    certificateOfConformance?: string
  }) {
    return prisma.lot.create({ data: { ...data, unit: data.unit ?? 'EA' } })
  }

  static async createBatch(data: {
    batchNumber: string
    workOrderId: string
    lotId?: string
    quantity: number
  }) {
    const batch = await prisma.batch.create({ data })

    // Record traceability event
    await this.recordEvent({
      batchId: batch.id,
      eventType: 'PRODUCTION_START',
      data: { workOrderId: data.workOrderId, quantity: data.quantity }
    })

    return batch
  }

  static async assignSerial(data: {
    serial: string
    batchId: string
    productId: string
  }) {
    const sn = await prisma.serialNumber.create({ data })

    await this.recordEvent({
      batchId: data.batchId,
      serialNumberId: sn.id,
      eventType: 'SERIAL_ASSIGNED',
      data: { serial: data.serial }
    })

    return sn
  }

  static async recordMaterialUsage(data: {
    batchId: string
    lotId: string
    quantity: number
    unit: string
    taskId?: string
    operatorId?: string
  }) {
    return prisma.materialUsage.create({ data })
  }

  static async recordEvent(data: {
    batchId?: string
    serialNumberId?: string
    eventType: string
    machineId?: string
    operatorId?: string
    taskId?: string
    data: object
  }) {
    return prisma.traceabilityRecord.create({
      data: {
        batchId: data.batchId,
        serialNumberId: data.serialNumberId,
        eventType: data.eventType,
        machineId: data.machineId,
        operatorId: data.operatorId,
        taskId: data.taskId,
        data: JSON.stringify(data.data),
        timestamp: new Date()
      }
    })
  }

  // Full genealogy tree for a serial number
  static async getGenealogy(serial: string) {
    const sn = await prisma.serialNumber.findUnique({
      where: { serial },
      include: {
        batch: {
          include: {
            workOrder: { include: { product: true } },
            lot: true,
            materialUsages: { include: { lot: true } },
            traceabilityRecords: { orderBy: { timestamp: 'asc' } }
          }
        },
        traceabilityRecords: { orderBy: { timestamp: 'asc' } }
      }
    })

    if (!sn) return null

    return {
      serialNumber: sn.serial,
      product: sn.batch.workOrder.product,
      batch: {
        batchNumber: sn.batch.batchNumber,
        workOrder: sn.batch.workOrder.orderNumber,
        quantity: sn.batch.quantity
      },
      rawMaterials: sn.batch.materialUsages.map(mu => ({
        lotNumber: mu.lot.lotNumber,
        quantity: mu.quantity,
        unit: mu.unit,
        usedAt: mu.usedAt
      })),
      operations: [...sn.batch.traceabilityRecords, ...sn.traceabilityRecords]
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .map(r => ({
          eventType: r.eventType,
          timestamp: r.timestamp,
          machineId: r.machineId,
          operatorId: r.operatorId,
          data: JSON.parse(r.data)
        }))
    }
  }

  // Lot forward trace: what products were made from this lot
  static async forwardTrace(lotNumber: string) {
    const lot = await prisma.lot.findUnique({
      where: { lotNumber },
      include: {
        materialUsages: {
          include: {
            batch: {
              include: {
                serialNumbers: true,
                workOrder: { include: { product: true } }
              }
            }
          }
        }
      }
    })

    if (!lot) return null

    return {
      lot: lot.lotNumber,
      product: lot,
      usedInBatches: lot.materialUsages.map(mu => ({
        batchNumber: mu.batch.batchNumber,
        workOrder: mu.batch.workOrder.orderNumber,
        product: mu.batch.workOrder.product.name,
        serialNumbers: mu.batch.serialNumbers.map(s => s.serial)
      }))
    }
  }
}
