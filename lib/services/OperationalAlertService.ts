import { prisma } from '@/lib/services/database';
import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';

const IDLE_ALERT_WINDOW_MS = 30 * 60 * 1000;
const TELEMETRY_STALE_MS = 15 * 60 * 1000;

export class OperationalAlertService {
  static async scanAndRaiseAlerts() {
    await OrderLifecycleService.flagOverdueOrders();
    await this.raiseIdleMachineAlerts();
  }

  private static async raiseIdleMachineAlerts() {
    const board = await prisma.andonBoard.findFirst({ where: { isActive: true } });
    const machines = await prisma.machine.findMany({
      where: { status: 'IDLE' },
      select: { id: true, code: true, name: true },
    });

    for (const machine of machines) {
      const [activeTaskCount, openDowntimeCount, latestTelemetry, existingAlert] = await Promise.all([
        prisma.workflowTask.count({ where: { machineId: machine.id, status: 'IN_PROGRESS' } }),
        prisma.downtimeEvent.count({ where: { machineId: machine.id, status: 'OPEN', endTime: null } }),
        prisma.machineTelemetry.findFirst({
          where: { machineId: machine.id },
          orderBy: { timestamp: 'desc' },
          select: { timestamp: true },
        }),
        prisma.systemEvent.findFirst({
          where: {
            eventType: 'MACHINE_IDLE',
            details: { contains: machine.id },
            timestamp: { gte: new Date(Date.now() - IDLE_ALERT_WINDOW_MS) },
          },
        }),
      ]);

      if (activeTaskCount > 0 || openDowntimeCount > 0 || existingAlert) continue;

      const telemetryIsStale = !latestTelemetry || Date.now() - latestTelemetry.timestamp.getTime() > TELEMETRY_STALE_MS;
      if (!telemetryIsStale) continue;

      const details = JSON.stringify({
        machineId: machine.id,
        machineCode: machine.code,
        machineName: machine.name,
        reason: 'IDLE_NO_ACTIVITY',
        message: `${machine.code} is idle with no recent activity`,
        timestamp: new Date().toISOString(),
      });

      await prisma.systemEvent.create({
        data: {
          eventType: 'MACHINE_IDLE',
          details,
        },
      });

      if (board) {
        await prisma.andonEvent.create({
          data: {
            boardId: board.id,
            machineId: machine.id,
            color: 'YELLOW',
            severity: 'WARNING',
            reason: 'MACHINE_IDLE',
            message: `${machine.code} idle with no recent activity`,
            triggeredBy: 'system',
          },
        }).catch(() => {});
      }
    }
  }
}
