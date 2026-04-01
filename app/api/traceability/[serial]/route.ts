import { NextRequest, NextResponse } from 'next/server'
import { TraceabilityService } from '@/lib/services/TraceabilityService'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  try {
    const { serial } = await params
    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    if (type === 'lot') {
      const forward = await TraceabilityService.forwardTrace(serial)
      if (!forward) {
        return NextResponse.json({ error: 'Lot number not found' }, { status: 404 })
      }
      return NextResponse.json(forward)
    }

    const genealogy = await TraceabilityService.getGenealogy(serial)
    if (!genealogy) {
      return NextResponse.json({ error: 'Serial number not found' }, { status: 404 })
    }
    return NextResponse.json(genealogy)
  } catch (error) {
    console.error('[GET /api/traceability]', error)
    return NextResponse.json({ error: 'Failed to fetch genealogy' }, { status: 500 })
  }
}
