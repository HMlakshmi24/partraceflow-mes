import { NextRequest, NextResponse } from 'next/server'
import { PredictiveMaintenanceService } from '@/lib/services/PredictiveMaintenanceService'
import { prisma } from '@/lib/services/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const machineId = searchParams.get('machineId')

    if (!machineId) {
      // Return latest predictions for all machines, enriched with machine info + health scores
      const [rawPredictions, healthScores, machines] = await Promise.all([
        prisma.healthPrediction.findMany({
          orderBy: { createdAt: 'desc' },
          distinct: ['machineId'],
          take: 50,
        }),
        prisma.machineHealthScore.findMany({
          orderBy: { calculatedAt: 'desc' },
          distinct: ['machineId'],
        }),
        prisma.machine.findMany({ select: { id: true, name: true, code: true } }),
      ])

      const machineMap = Object.fromEntries(machines.map(m => [m.id, m]))
      const healthMap = Object.fromEntries(healthScores.map(h => [h.machineId, h]))

      const predictions = rawPredictions.map(p => {
        const machine = machineMap[p.machineId]
        const health = healthMap[p.machineId]
        const score = health?.overallScore ?? 100
        const failProb = p.value ?? 0
        const riskLevel =
          score < 50 ? 'CRITICAL' :
          score < 65 ? 'HIGH' :
          score < 80 ? 'MEDIUM' : 'LOW'

        // Parse feature snapshot for indicators
        let features: Record<string, number> = {}
        try { features = JSON.parse(p.featureSnapshot ?? '{}') } catch { /* ignore */ }

        const indicators = [
          features.vibration != null ? { name: 'Vibration', value: `${features.vibration}%`, status: features.vibration < 50 ? 'critical' : features.vibration < 70 ? 'warning' : 'ok' } : null,
          features.temp != null ? { name: 'Temperature', value: `${features.temp}%`, status: features.temp < 50 ? 'critical' : features.temp < 70 ? 'warning' : 'ok' } : null,
          features.runtime != null ? { name: 'Runtime Hours', value: `${features.runtime}%`, status: features.runtime < 50 ? 'critical' : features.runtime < 70 ? 'warning' : 'ok' } : null,
        ].filter(Boolean)

        return {
          ...p,
          machineName: machine?.name ?? p.machineId,
          machineCode: machine?.code ?? '—',
          healthScore: Math.round(score),
          failureProbability: failProb,
          riskLevel,
          maintenanceRecommendation: p.recommendedAction ?? 'No action required',
          estimatedTimeToFailure: riskLevel === 'CRITICAL' ? 4 * 24 : riskLevel === 'HIGH' ? 14 * 24 : undefined,
          lastUpdated: p.createdAt,
          indicators,
        }
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
