import { NextRequest, NextResponse } from 'next/server'
import { DowntimeService } from '@/lib/services/DowntimeService'
import { prisma } from '@/lib/services/database'

export async function GET(request: NextRequest) {
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
      const limit = parseInt(searchParams.get('limit') ?? '100')
      const hours = parseInt(searchParams.get('hours') ?? '168')
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
      const hours = parseInt(searchParams.get('hours') ?? '24')
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
      }).catch(() => {});
      return NextResponse.json({ success: true, downtimeEvent: event })
    }

    if (action === 'end') {
      const { downtimeEventId, ...endData } = data
      const event = await DowntimeService.endDowntime(downtimeEventId, endData)
      return NextResponse.json({ success: true, downtimeEvent: event })
    }

    return NextResponse.json({ error: 'Invalid action. Use start or end' }, { status: 400 })
  } catch (error) {
    console.error('[POST /api/downtime]', error)
    return NextResponse.json({ error: 'Failed to process downtime action' }, { status: 500 })
  }
}
