import { prisma } from '@/lib/services/database'

export class ShiftService {

  static async getCurrentShift(plantId: string) {
    const now = new Date()
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const schedule = await prisma.shiftSchedule.findFirst({
      where: {
        date: todayDate,
        status: 'ACTIVE',
        shift: { plantId }
      },
      include: {
        shift: true,
        operatorShifts: { include: { user: true } },
        shiftProduction: true
      }
    })

    return schedule
  }

  static async startShift(scheduleId: string): Promise<void> {
    await prisma.shiftSchedule.update({
      where: { id: scheduleId },
      data: { status: 'ACTIVE' }
    })

    // Create ShiftProduction record
    const existing = await prisma.shiftProduction.findUnique({ where: { scheduleId } })
    if (!existing) {
      await prisma.shiftProduction.create({
        data: { scheduleId }
      })
    }
  }

  static async closeShift(scheduleId: string): Promise<void> {
    // Clock out all operators
    await prisma.operatorShift.updateMany({
      where: { scheduleId, clockOut: null },
      data: { clockOut: new Date() }
    })

    // Calculate final OEE
    const production = await prisma.shiftProduction.findUnique({ where: { scheduleId } })
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id: scheduleId },
      include: { shift: true }
    })

    if (production && schedule) {
      const shiftMinutes = schedule.shift.durationHours * 60
      const netOperatingTime = shiftMinutes - production.plannedDowntime - production.unplannedDowntime
      const availability = netOperatingTime / shiftMinutes
      const performance = schedule.targetQuantity > 0 ? production.actualQuantity / schedule.targetQuantity : 0
      const quality = production.actualQuantity > 0 ? production.goodQuantity / production.actualQuantity : 0
      const oee = availability * performance * quality

      await prisma.shiftProduction.update({
        where: { scheduleId },
        data: {
          availability: availability * 100,
          performance: performance * 100,
          quality: quality * 100,
          oee: oee * 100,
          updatedAt: new Date()
        }
      })
    }

    await prisma.shiftSchedule.update({
      where: { id: scheduleId },
      data: { status: 'COMPLETED' }
    })
  }

  static async updateProduction(scheduleId: string, delta: {
    goodQuantity?: number
    scrapQuantity?: number
    unplannedDowntime?: number
  }) {
    const production = await prisma.shiftProduction.findUnique({ where: { scheduleId } })
    if (!production) return

    const updates: Record<string, number> = {}
    if (delta.goodQuantity) {
      updates.goodQuantity = production.goodQuantity + delta.goodQuantity
      updates.actualQuantity = production.actualQuantity + delta.goodQuantity
    }
    if (delta.scrapQuantity) {
      updates.scrapQuantity = production.scrapQuantity + delta.scrapQuantity
      updates.actualQuantity = (updates.actualQuantity ?? production.actualQuantity) + delta.scrapQuantity
    }
    if (delta.unplannedDowntime) {
      updates.unplannedDowntime = production.unplannedDowntime + delta.unplannedDowntime
    }

    await prisma.shiftProduction.update({
      where: { scheduleId },
      data: { ...updates, updatedAt: new Date() }
    })
  }

  static async getShiftOEEHistory(plantId: string, days: number) {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)

    return prisma.shiftProduction.findMany({
      where: {
        schedule: {
          shift: { plantId },
          date: { gte: fromDate }
        }
      },
      include: {
        schedule: {
          include: { shift: true }
        }
      },
      orderBy: { schedule: { date: 'asc' } }
    })
  }
}
