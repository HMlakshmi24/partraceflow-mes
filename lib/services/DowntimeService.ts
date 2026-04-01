import { prisma } from '@/lib/services/database'

export interface DowntimeKPIs {
  totalDowntimeMinutes: number
  plannedDowntimeMinutes: number
  unplannedDowntimeMinutes: number
  mtbf: number // Mean Time Between Failures (hours)
  mttr: number // Mean Time To Repair (minutes)
  availabilityPercent: number
  topReasons: { reason: string; minutes: number; count: number }[]
}

export class DowntimeService {

  static async startDowntime(data: {
    machineId: string
    reasonId?: string
    reportedBy?: string
    shiftId?: string
  }) {
    // Close any open downtime for this machine first
    await prisma.downtimeEvent.updateMany({
      where: { machineId: data.machineId, status: 'OPEN', endTime: null },
      data: { endTime: new Date(), status: 'CLOSED' }
    })

    const event = await prisma.downtimeEvent.create({
      data: {
        machineId: data.machineId,
        reasonId: data.reasonId,
        reportedBy: data.reportedBy,
        shiftId: data.shiftId,
        startTime: new Date(),
        status: 'OPEN'
      }
    })

    // Update machine status
    await prisma.machine.update({
      where: { id: data.machineId },
      data: { status: 'DOWN' }
    })

    return event
  }

  static async endDowntime(downtimeEventId: string, data: {
    reasonId?: string
    rootCause?: string
    correctiveAction?: string
  }) {
    const event = await prisma.downtimeEvent.findUnique({ where: { id: downtimeEventId } })
    if (!event) throw new Error('Downtime event not found')

    const endTime = new Date()
    const durationMinutes = (endTime.getTime() - event.startTime.getTime()) / 60000

    const updated = await prisma.downtimeEvent.update({
      where: { id: downtimeEventId },
      data: {
        endTime,
        durationMinutes,
        status: 'CLOSED',
        reasonId: data.reasonId,
        rootCause: data.rootCause,
        correctiveAction: data.correctiveAction
      }
    })

    // Restore machine status
    await prisma.machine.update({
      where: { id: event.machineId },
      data: { status: 'IDLE' }
    })

    return updated
  }

  static async getKPIs(machineId: string, fromDate: Date, toDate: Date): Promise<DowntimeKPIs> {
    const events = await prisma.downtimeEvent.findMany({
      where: {
        machineId,
        startTime: { gte: fromDate, lte: toDate },
        status: 'CLOSED'
      },
      include: { reason: { include: { category: true } } }
    })

    const totalMinutes = events.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0)
    const plannedMinutes = events
      .filter(e => e.reason?.category?.type === 'PLANNED')
      .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0)
    const unplannedMinutes = totalMinutes - plannedMinutes

    const periodHours = (toDate.getTime() - fromDate.getTime()) / 3600000
    const uptime = periodHours * 60 - totalMinutes
    const availability = totalMinutes > 0 ? (uptime / (periodHours * 60)) * 100 : 100

    // MTBF = uptime / number of failures
    const failures = events.filter(e => e.reason?.category?.type === 'UNPLANNED').length
    const mtbf = failures > 0 ? (uptime / 60) / failures : periodHours

    // MTTR = average repair time (unplanned)
    const unplannedEvents = events.filter(e => e.reason?.category?.type === 'UNPLANNED')
    const mttr = unplannedEvents.length > 0
      ? unplannedEvents.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / unplannedEvents.length
      : 0

    // Top reasons
    const reasonMap = new Map<string, { reason: string; minutes: number; count: number }>()
    for (const event of events) {
      const key = event.reason?.name ?? 'Unknown'
      const existing = reasonMap.get(key) ?? { reason: key, minutes: 0, count: 0 }
      existing.minutes += event.durationMinutes ?? 0
      existing.count++
      reasonMap.set(key, existing)
    }
    const topReasons = Array.from(reasonMap.values()).sort((a, b) => b.minutes - a.minutes).slice(0, 10)

    return {
      totalDowntimeMinutes: totalMinutes,
      plannedDowntimeMinutes: plannedMinutes,
      unplannedDowntimeMinutes: unplannedMinutes,
      mtbf,
      mttr,
      availabilityPercent: availability,
      topReasons
    }
  }

  static async getOpenDowntimes() {
    return prisma.downtimeEvent.findMany({
      where: { status: 'OPEN' },
      include: { machine: true, reason: { include: { category: true } } },
      orderBy: { startTime: 'asc' }
    })
  }
}
