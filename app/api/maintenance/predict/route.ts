import { NextRequest, NextResponse } from 'next/server'
import { PredictiveMaintenanceService } from '@/lib/services/PredictiveMaintenanceService'
import { prisma } from '@/lib/services/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const machineId = searchParams.get('machineId')

    if (!machineId) {
      // Return latest predictions for all machines
      const predictions = await prisma.healthPrediction.findMany({
        orderBy: { createdAt: 'desc' },
        distinct: ['machineId'],
        take: 50
      })
      return NextResponse.json({ predictions })
    }

    const [health, prediction] = await Promise.all([
      PredictiveMaintenanceService.calculateHealthScore(machineId),
      PredictiveMaintenanceService.predictFailure(machineId)
    ])

    return NextResponse.json({ machineId, health, prediction })
  } catch (error) {
    console.error('[GET /api/maintenance/predict]', error)
    return NextResponse.json({ error: 'Prediction failed' }, { status: 500 })
  }
}
