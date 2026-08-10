import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { TelemetryService } from '@/lib/services/TelemetryService'
import { EventRuleEngine } from '@/lib/engines/EventRuleEngine'
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth';

const TELEMETRY_ROLES = ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireRole(request, TELEMETRY_ROLES);
  if (authError) return authError;

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
  const authError = await requireRole(request, TELEMETRY_ROLES);
  if (authError) return authError;

  try {
    const { id } = await params
    const body = await request.json()
    const { signals } = body

    // Bug fix: a missing/malformed `signals` field threw a TypeError from
    // `signals.map` further down, caught by the generic handler and
    // surfaced as a 500 — an edge device sending a bad payload looked like
    // a server fault instead of a rejected bad request.
    if (!Array.isArray(signals)) {
      return NextResponse.json({ error: 'signals must be an array' }, { status: 400 })
    }

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
    }).filter((p): p is NonNullable<typeof p> => p !== null)

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
        return handleApiError('[POST /api/machines/telemetry]', error);
  }
}
