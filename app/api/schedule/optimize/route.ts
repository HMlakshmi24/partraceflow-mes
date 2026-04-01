import { NextRequest, NextResponse } from 'next/server'
import { SchedulingEngine } from '@/lib/engines/SchedulingEngine'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      workOrderIds,
      fromDate,
      toDate,
      optimizationGoal = 'MINIMIZE_LATENESS'
    } = body

    if (!workOrderIds || !Array.isArray(workOrderIds)) {
      return NextResponse.json({ error: 'workOrderIds array required' }, { status: 400 })
    }

    const result = await SchedulingEngine.optimizeSchedule({
      workOrderIds,
      fromDate: fromDate ? new Date(fromDate) : new Date(),
      toDate: toDate ? new Date(toDate) : new Date(Date.now() + 7 * 24 * 3600000),
      optimizationGoal
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[POST /api/schedule/optimize]', error)
    return NextResponse.json({ error: 'Scheduling optimization failed' }, { status: 500 })
  }
}
