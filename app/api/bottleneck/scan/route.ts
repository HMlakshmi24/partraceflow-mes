import { NextRequest, NextResponse } from 'next/server'
import { BottleneckDetectionService } from '@/lib/services/BottleneckDetectionService'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const plantId = searchParams.get('plantId') ?? undefined
    const bottlenecks = await BottleneckDetectionService.scanPlant(plantId)
    return NextResponse.json({ bottlenecks, count: bottlenecks.length, scannedAt: new Date() })
  } catch (error) {
    console.error('[GET /api/bottleneck/scan]', error)
    return NextResponse.json({ error: 'Bottleneck scan failed' }, { status: 500 })
  }
}
