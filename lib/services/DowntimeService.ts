import { prisma } from '@/lib/services/database'
import { RuntimeEngine } from '@/lib/services/RuntimeEngine'

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
    // Bug fix (found via audit): "close any open event" then "create a new
    // one" used to be two unguarded, unsynchronized writes. Two concurrent
    // starts for the same machine (e.g. a manual API call racing an
    // MQTT-triggered downtime) could both pass the close step and each
    // create their own OPEN event, leaving two simultaneous open downtime
    // events for one machine. Wrapped in a Serializable transaction with
    // retry-on-conflict, same pattern as AuditChainService.appendChain —
    // concurrent starts for the same machine are an expected occurrence
    // here, not exceptional.
    const MAX_ATTEMPTS = 3
    let event
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        event = await prisma.$transaction(async (tx) => {
          await tx.downtimeEvent.updateMany({
            where: { machineId: data.machineId, status: 'OPEN', endTime: null },
            data: { endTime: new Date(), status: 'CLOSED' }
          })
          return tx.downtimeEvent.create({
            data: {
              machineId: data.machineId,
              reasonId: data.reasonId,
              reportedBy: data.reportedBy,
              shiftId: data.shiftId,
              startTime: new Date(),
              status: 'OPEN'
            }
          })
        }, { isolationLevel: 'Serializable' })
        break
      } catch (e: any) {
        if (e?.code === 'P2034' && attempt < MAX_ATTEMPTS) continue // write conflict — retry
        throw e
      }
    }

    // Update machine status (CRIT-5 fix: route through RuntimeEngine so
    // MachineRuntime.status stays in sync with Machine.status).
    await RuntimeEngine.upsertHeartbeat(data.machineId, { status: 'DOWN' })

    return event!
  }

  static async endDowntime(downtimeEventId: string, data: {
    reasonId?: string
    rootCause?: string
    correctiveAction?: string
    resolutionNotes?: string
  }) {
    const event = await prisma.downtimeEvent.findUnique({ where: { id: downtimeEventId } })
    if (!event) throw new Error('Downtime event not found')

    // Guard: prevent double-resolving an already closed event
    if (event.status === 'CLOSED') {
      throw new Error('This downtime event has already been resolved.')
    }

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
        // Map resolutionNotes → correctiveAction so frontend notes are saved
        correctiveAction: data.resolutionNotes ?? data.correctiveAction,
      }
    })

    // Restore machine to RUNNING (not IDLE) so it shows green on the dashboard.
    // (CRIT-5 fix: route through RuntimeEngine to keep MachineRuntime.status in sync.)
    await RuntimeEngine.upsertHeartbeat(event.machineId, { status: 'RUNNING' })

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

    // Bug fix (found via audit): events are filtered on startTime falling
    // inside [fromDate, toDate], but their full stored durationMinutes
    // (computed from the event's real, unbounded endTime) was summed
    // regardless — an event that starts just before toDate but runs long
    // counted its entire duration even though most of it falls outside the
    // reporting window. For a short window that pushed totalMinutes above
    // periodHours*60, making uptime negative and availabilityPercent a
    // large negative number instead of a sane [0,100] value. Each event's
    // contribution is now clamped to its actual overlap with the window.
    const clampedMinutes = (e: (typeof events)[number]): number => {
      if (!e.endTime) return 0
      const overlapEnd = Math.min(e.endTime.getTime(), toDate.getTime())
      const overlapStart = Math.max(e.startTime.getTime(), fromDate.getTime())
      return Math.max(0, overlapEnd - overlapStart) / 60000
    }

    const totalMinutes = events.reduce((sum, e) => sum + clampedMinutes(e), 0)
    const plannedMinutes = events
      .filter(e => e.reason?.category?.type === 'PLANNED')
      .reduce((sum, e) => sum + clampedMinutes(e), 0)
    const unplannedMinutes = totalMinutes - plannedMinutes

    const periodHours = (toDate.getTime() - fromDate.getTime()) / 3600000
    const uptime = Math.max(0, periodHours * 60 - totalMinutes)
    const availability = totalMinutes > 0 ? (uptime / (periodHours * 60)) * 100 : 100

    // MTBF = uptime / number of failures
    const failures = events.filter(e => e.reason?.category?.type === 'UNPLANNED').length
    const mtbf = failures > 0 ? (uptime / 60) / failures : periodHours

    // MTTR = average repair time (unplanned) — uses each event's real
    // duration (not window-clamped): a repair's length is a property of
    // the repair itself, not of whatever reporting window it's viewed
    // through.
    const unplannedEvents = events.filter(e => e.reason?.category?.type === 'UNPLANNED')
    const mttr = unplannedEvents.length > 0
      ? unplannedEvents.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0) / unplannedEvents.length
      : 0

    // Top reasons — uses window-clamped minutes so this stays consistent
    // with totalDowntimeMinutes above.
    const reasonMap = new Map<string, { reason: string; minutes: number; count: number }>()
    for (const event of events) {
      const key = event.reason?.name ?? 'Unknown'
      const existing = reasonMap.get(key) ?? { reason: key, minutes: 0, count: 0 }
      existing.minutes += clampedMinutes(event)
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
