import { NextRequest, NextResponse } from 'next/server'
import { TelemetryService } from '@/lib/services/TelemetryService'
import { EventRuleEngine } from '@/lib/engines/EventRuleEngine'
import { prisma } from '@/lib/services/database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const hoursBack = parseInt(searchParams.get('hours') ?? '1')
    const fromTime = new Date(Date.now() - hoursBack * 3600000)

    const latest = await TelemetryService.getLatestByMachine(id)
    return NextResponse.json({ machineId: id, signals: latest, from: fromTime })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch telemetry' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { signals } = body

    const machineSignals = await prisma.machineSignal.findMany({
      where: { machineId: id, isActive: true }
    })

    const points = signals.map((s: { signalName: string; value: string; quality?: string; sourceTimestamp?: string }) => {
      const signal = machineSignals.find(ms => ms.signalName === s.signalName)
      if (!signal) return null
      return {
        signalId: signal.id,
        machineId: id,
        value: String(s.value),
        quality: s.quality,
        sourceTimestamp: s.sourceTimestamp ? new Date(s.sourceTimestamp) : undefined
      }
    }).filter(Boolean)

    await TelemetryService.ingestBatch(points)

    for (const point of points) {
      await EventRuleEngine.evaluate({
        machineId: id,
        signalId: point.signalId,
        currentValue: parseFloat(point.value) || point.value,
        timestamp: new Date()
      })
    }

    return NextResponse.json({ success: true, ingested: points.length })
  } catch (error) {
    console.error('[POST /api/machines/telemetry]', error)
    return NextResponse.json({ error: 'Failed to ingest telemetry' }, { status: 500 })
  }
}
