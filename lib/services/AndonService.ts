import { prisma } from '@/lib/services/database'
import { eventBus } from '@/lib/events/EventBus'

export type AndonColor = 'GREEN' | 'YELLOW' | 'RED' | 'BLUE' | 'WHITE' | 'OFF'

export class AndonService {

  static async triggerAndon(data: {
    boardId: string
    machineId?: string
    triggeredBy?: string
    reason: string
    severity?: string
    color: AndonColor
    message: string
  }) {
    const event = await prisma.andonEvent.create({
      data: {
        boardId: data.boardId,
        machineId: data.machineId,
        triggeredBy: data.triggeredBy ?? 'SYSTEM',
        reason: data.reason,
        severity: data.severity ?? 'WARNING',
        color: data.color,
        message: data.message,
        acknowledged: false
      }
    })

    // Update the board display zone
    await prisma.andonDisplay.updateMany({
      where: { boardId: data.boardId },
      data: {
        currentColor: data.color,
        message: data.message,
        updatedAt: new Date()
      }
    })

    // Broadcast via event bus → SSE → all connected dashboards
    eventBus.publish({
      type: 'andon.triggered',
      source: 'AndonService',
      machineId: data.machineId,
      payload: {
        boardId: data.boardId,
        color: data.color,
        message: data.message,
        severity: data.severity ?? 'WARNING',
        eventId: event.id
      }
    })

    return event
  }

  static async acknowledgeAndon(eventId: string, userId: string) {
    return prisma.andonEvent.update({
      where: { id: eventId },
      data: {
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      }
    })
  }

  static async resolveAndon(eventId: string) {
    const event = await prisma.andonEvent.update({
      where: { id: eventId },
      data: { resolvedAt: new Date() }
    })

    // Reset board to GREEN when resolved
    await prisma.andonDisplay.updateMany({
      where: { boardId: event.boardId },
      data: { currentColor: 'GREEN', message: null, updatedAt: new Date() }
    })

    return event
  }

  // Auto-trigger Andon based on machine downtime
  static async checkAndTriggerForDowntime(machineId: string, durationMinutes: number) {
    const boards = await prisma.andonBoard.findMany({
      where: { isActive: true }
    })

    if (boards.length === 0) return

    const board = boards[0]
    const color: AndonColor = durationMinutes > 30 ? 'RED' : durationMinutes > 10 ? 'YELLOW' : 'YELLOW'
    const severity = durationMinutes > 30 ? 'CRITICAL' : 'WARNING'

    await this.triggerAndon({
      boardId: board.id,
      machineId,
      triggeredBy: 'SYSTEM',
      reason: 'MACHINE_DOWNTIME',
      severity,
      color,
      message: `Machine down for ${Math.round(durationMinutes)} min`
    })
  }

  static async getActiveAlerts() {
    return prisma.andonEvent.findMany({
      where: { resolvedAt: null },
      include: { board: true },
      orderBy: { timestamp: 'desc' }
    })
  }

  static async getBoardStatus(boardId: string) {
    return prisma.andonBoard.findUnique({
      where: { id: boardId },
      include: {
        displays: true,
        events: {
          where: { resolvedAt: null },
          orderBy: { timestamp: 'desc' },
          take: 10
        }
      }
    })
  }
}
