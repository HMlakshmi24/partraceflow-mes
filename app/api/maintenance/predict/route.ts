import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { PredictiveMaintenanceService } from '@/lib/services/PredictiveMaintenanceService'
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth';

const MAINTENANCE_ROLES = ['ADMIN', 'SUPERVISOR', 'MAINTENANCE', 'OPERATOR'];

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, MAINTENANCE_ROLES);
  if (authError) return authError;

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
          machineCode: machine?.code ?? 'â€”',
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
        return handleApiError('[GET /api/maintenance/predict]', error);
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireRole(request, MAINTENANCE_ROLES);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { action, machineId } = body;

    // This is the only action this route currently supports — the "Create
    // Maintenance Work Order" button on the predictive-maintenance page,
    // which previously called this endpoint but the route had no POST
    // handler at all (a 405 on every single click).
    if (action === 'create_work_order') {
      if (!machineId) return NextResponse.json({ error: 'machineId is required' }, { status: 400 });

      const machine = await prisma.machine.findUnique({ where: { id: machineId }, select: { id: true, name: true, code: true } });
      if (!machine) return NextResponse.json({ error: 'Machine not found' }, { status: 404 });

      const prediction = await PredictiveMaintenanceService.predictFailure(machineId);
      const now = new Date();
      const window = await prisma.maintenanceWindow.create({
        data: {
          machineId,
          title: `Corrective maintenance — ${machine.name} (${machine.code})`,
          type: 'CORRECTIVE',
          scheduledStart: now,
          // Predicted-imminent failures get a same-day window; otherwise a
          // standard next-business-day window.
          scheduledEnd: new Date(now.getTime() + (prediction.probability > 0.7 ? 4 : 24) * 3600 * 1000),
          status: 'SCHEDULED',
          notes: prediction.probability > 0.7
            ? `Auto-created from a high-risk failure prediction (${Math.round(prediction.probability * 100)}% probability). Immediate attention recommended.`
            : `Auto-created from a predictive-maintenance work order request (${Math.round(prediction.probability * 100)}% failure probability).`,
        },
      });

      return NextResponse.json({ success: true, maintenanceWindow: window });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
        return handleApiError('[POST /api/maintenance/predict]', error);
  }
}
