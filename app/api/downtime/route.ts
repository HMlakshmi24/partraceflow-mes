import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { DowntimeService } from '@/lib/services/DowntimeService'
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth'
import { RuntimeEngine } from '@/lib/services/RuntimeEngine'
import { createLogger } from '@/lib/logger'

const log = createLogger('downtime');

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'PLANNER', 'MAINTENANCE', 'QC', 'QUALITY']);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url)
    const machineId = searchParams.get('machineId')
    const openOnly = searchParams.get('open') === 'true'
    const action = searchParams.get('action')

    if (openOnly) {
      const open = await DowntimeService.getOpenDowntimes()
      return NextResponse.json({ downtimeEvents: open })
    }

    // History: return recent downtime events with reason names for pareto charts
    if (action === 'history') {
      const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100') || 100))
      const hours = Math.max(1, parseInt(searchParams.get('hours') ?? '168') || 168)
      const fromDate = new Date(Date.now() - hours * 3600000)
      const events = await prisma.downtimeEvent.findMany({
        where: { startTime: { gte: fromDate } },
        include: { reason: { include: { category: true } } },
        orderBy: { startTime: 'desc' },
        take: limit,
      })
      return NextResponse.json({ events })
    }

    if (machineId) {
      const hours = Math.max(1, parseInt(searchParams.get('hours') ?? '24') || 24)
      const toDate = new Date()
      const fromDate = new Date(toDate.getTime() - hours * 3600000)
      const kpis = await DowntimeService.getKPIs(machineId, fromDate, toDate)
      return NextResponse.json({ machineId, kpis, period: { from: fromDate, to: toDate } })
    }

    return NextResponse.json({ error: 'machineId, open=true, or action=history required' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch downtime data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE']);
  if (authError) return authError;

  try {
    const body = await request.json()
    const { action, ...data } = body

    if (action === 'start') {
      // If a plain reason string is provided, resolve/create the reasonId
      if (data.reason && !data.reasonId) {
        const reasonName = String(data.reason).trim();
        let reason = await prisma.downtimeReason.findFirst({ where: { name: reasonName } });
        if (!reason) {
          // Ensure a default category exists
          let cat = await prisma.downtimeCategory.findFirst({ where: { code: 'GENERAL' } });
          if (!cat) {
            cat = await prisma.downtimeCategory.create({
              data: { code: 'GENERAL', name: 'General', type: 'UNPLANNED' }
            });
          }
          reason = await prisma.downtimeReason.create({
            data: { code: reasonName.toUpperCase().replace(/\s+/g, '_').slice(0, 20), name: reasonName, categoryId: cat.id }
          });
        }
        data.reasonId = reason.id;
        delete data.reason;
      }
      const event = await DowntimeService.startDowntime(data)
      // Log system event for visibility
      await prisma.systemEvent.create({
        data: { eventType: 'DOWNTIME_START', details: `Downtime started on ${data.machineId}: ${data.notes || 'No notes'}` }
      }).catch((e) => { log.warn('systemEvent.create failed (non-fatal)', { message: e?.message }); });
      return NextResponse.json({ success: true, downtimeEvent: event })
    }

    if (action === 'end') {
      const { downtimeEventId, resolutionNotes, ...endData } = data
      const event = await DowntimeService.endDowntime(downtimeEventId, { ...endData, resolutionNotes })
      return NextResponse.json({ success: true, downtimeEvent: event })
    }

    // Recovery path for stale DOWN states where no OPEN downtime row exists.
    if (action === 'recover-machine') {
      const machineId = String(data.machineId ?? '').trim()
      if (!machineId) {
        return NextResponse.json({ error: 'machineId is required for recover-machine action' }, { status: 400 })
      }

      // Close any lingering OPEN downtime rows if they exist.
      await prisma.downtimeEvent.updateMany({
        where: { machineId, status: 'OPEN', endTime: null },
        data: {
          endTime: new Date(),
          status: 'CLOSED',
          correctiveAction: data.resolutionNotes ?? 'Recovered by operator (stale down state)',
        }
      })

      // Bring machine back online + cascade resolve connected downtime.
      const { getConnectedChain } = await import('@/lib/services/machineGraph');
      const machine = await prisma.machine.findUnique({ where: { id: machineId }, select: { code: true } });
      const connectedCodes = machine?.code ? await getConnectedChain(machine.code) : [machine?.code].filter(Boolean);

      // Close any lingering OPEN downtime rows for the entire connected chain.
      // (If some machines don't have open events, updateMany is safe.)
      if (connectedCodes.length > 0) {
        const machines = await prisma.machine.findMany({ where: { code: { in: connectedCodes as any } }, select: { id: true } });
        const ids = machines.map(m => m.id);
        if (ids.length > 0) {
          await prisma.downtimeEvent.updateMany({
            where: { machineId: { in: ids }, status: 'OPEN', endTime: null },
            data: {
              endTime: new Date(),
              status: 'CLOSED',
              correctiveAction: data.resolutionNotes ?? 'Recovered by operator (cascade)',
            }
          });
          // CRIT-5 fix: route each machine through RuntimeEngine (instead of a
          // bare updateMany) so MachineRuntime.status stays in sync for the
          // whole connected chain, not just the primary machine.
          await Promise.all(ids.map(id => RuntimeEngine.upsertHeartbeat(id, { status: 'RUNNING' })));
        }
      }

      // Return the primary machine for UI.
      await RuntimeEngine.upsertHeartbeat(machineId, { status: 'RUNNING' });
      const updated = await prisma.machine.findUniqueOrThrow({ where: { id: machineId } });

      return NextResponse.json({ success: true, machine: updated })
    }

    return NextResponse.json({ error: 'Invalid action. Use start or end' }, { status: 400 })
  } catch (error) {
        return handleApiError('[POST /api/downtime]', error);
  }
}
