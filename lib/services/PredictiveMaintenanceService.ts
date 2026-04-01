import { prisma } from '@/lib/services/database'
import { eventBus } from '@/lib/events/EventBus'

// Rule-based health scoring engine
// No external ML API required — uses physics-based thresholds
// In production: replace scoring functions with trained ML model calls (scikit-learn / ONNX)

export class PredictiveMaintenanceService {

  static async calculateHealthScore(machineId: string): Promise<{
    overallScore: number
    vibrationScore: number | null
    temperatureScore: number | null
    currentScore: number | null
    runtimeScore: number | null
    recommendation: string
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  }> {
    // Get latest signal values
    const signals = await prisma.machineSignal.findMany({
      where: { machineId, isActive: true },
      include: {
        telemetry: { orderBy: { timestamp: 'desc' }, take: 1 }
      }
    })

    const getValue = (name: string): number | null => {
      const signal = signals.find(s =>
        s.signalName.toLowerCase().includes(name.toLowerCase())
      )
      const val = signal?.telemetry[0]?.value
      return val !== undefined ? parseFloat(val) : null
    }

    // Score each signal (0-100, 100 = perfect health)
    const tempValue = getValue('temperature')
    const vibValue = getValue('vibration')
    const currentValue = getValue('current')

    // Temperature scoring (assume 0-100°C range, >80°C = degraded)
    let temperatureScore: number | null = null
    if (tempValue !== null) {
      if (tempValue < 60) temperatureScore = 100
      else if (tempValue < 75) temperatureScore = 80
      else if (tempValue < 85) temperatureScore = 60
      else if (tempValue < 95) temperatureScore = 30
      else temperatureScore = 10
    }

    // Vibration scoring (assume mm/s, >7 mm/s = critical per ISO 10816)
    let vibrationScore: number | null = null
    if (vibValue !== null) {
      if (vibValue < 2.8) vibrationScore = 100   // Good (ISO Zone A)
      else if (vibValue < 4.5) vibrationScore = 80  // Satisfactory (Zone B)
      else if (vibValue < 7.1) vibrationScore = 50  // Unsatisfactory (Zone C)
      else vibrationScore = 20                       // Unacceptable (Zone D)
    }

    // Current scoring (detect motor overload)
    let currentScore: number | null = null
    if (currentValue !== null) {
      if (currentValue < 70) currentScore = 100
      else if (currentValue < 85) currentScore = 75
      else if (currentValue < 95) currentScore = 50
      else currentScore = 20
    }

    // Runtime score from component hours
    const components = await prisma.machineComponent.findMany({
      where: { machineId }
    })
    let runtimeScore: number | null = null
    if (components.length > 0) {
      const scores = components.map(c => {
        if (!c.lifespan || c.lifespan === 0) return 100
        return Math.max(0, (1 - c.hoursRun / c.lifespan) * 100)
      })
      runtimeScore = scores.reduce((a, b) => a + b, 0) / scores.length
    }

    // Weighted average
    const activeScores = [temperatureScore, vibrationScore, currentScore, runtimeScore].filter(s => s !== null) as number[]
    const overallScore = activeScores.length > 0
      ? activeScores.reduce((a, b) => a + b, 0) / activeScores.length
      : 100

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    let recommendation: string

    if (overallScore >= 80) {
      riskLevel = 'LOW'
      recommendation = 'Machine is in good health. Continue normal operation.'
    } else if (overallScore >= 60) {
      riskLevel = 'MEDIUM'
      recommendation = 'Monitor closely. Schedule inspection within 1 week.'
    } else if (overallScore >= 40) {
      riskLevel = 'HIGH'
      recommendation = 'Schedule maintenance within 48 hours. Risk of unplanned failure.'
    } else {
      riskLevel = 'CRITICAL'
      recommendation = 'STOP MACHINE. Immediate maintenance required to prevent damage.'
    }

    // Persist health score
    await prisma.machineHealthScore.create({
      data: {
        machineId,
        overallScore,
        vibrationScore,
        temperatureScore,
        currentScore,
        runtimeScore,
        calculatedAt: new Date()
      }
    })

    if (overallScore < 40) {
      eventBus.publish({
        type: 'maintenance.predicted',
        source: 'PredictiveMaintenanceService',
        machineId,
        payload: { overallScore, riskLevel, recommendation }
      })
    }

    return { overallScore, vibrationScore, temperatureScore, currentScore, runtimeScore, recommendation, riskLevel }
  }

  // Predict failure date using linear degradation (simplified)
  static async predictFailure(machineId: string): Promise<{
    probability: number
    estimatedDaysToFailure: number | null
    confidence: number
  }> {
    // Get health score trend over last 7 days
    const scores = await prisma.machineHealthScore.findMany({
      where: {
        machineId,
        calculatedAt: { gte: new Date(Date.now() - 7 * 24 * 3600000) }
      },
      orderBy: { calculatedAt: 'asc' }
    })

    if (scores.length < 3) {
      return { probability: 0.1, estimatedDaysToFailure: null, confidence: 0.3 }
    }

    // Linear regression on health score trend
    const n = scores.length
    const xVals = scores.map((_, i) => i)
    const yVals = scores.map(s => s.overallScore)

    const xMean = xVals.reduce((a, b) => a + b, 0) / n
    const yMean = yVals.reduce((a, b) => a + b, 0) / n
    const slope = xVals.reduce((sum, x, i) => sum + (x - xMean) * (yVals[i] - yMean), 0) /
                  xVals.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0)

    const currentScore = yVals[n - 1]
    const failureThreshold = 20 // score below 20 = failure

    let estimatedDaysToFailure: number | null = null
    if (slope < 0) {
      // How many more steps to reach failure threshold?
      const stepsToFailure = (currentScore - failureThreshold) / Math.abs(slope)
      // Each step = one health check interval (assume hourly checks)
      const intervalHours = (scores[1].calculatedAt.getTime() - scores[0].calculatedAt.getTime()) / 3600000
      estimatedDaysToFailure = (stepsToFailure * intervalHours) / 24
    }

    const probability = Math.max(0, Math.min(1, (100 - currentScore) / 100))

    await prisma.healthPrediction.create({
      data: {
        machineId,
        predictionType: 'FAILURE_PROBABILITY',
        value: probability,
        confidence: 0.7,
        predictedFailureDate: estimatedDaysToFailure
          ? new Date(Date.now() + estimatedDaysToFailure * 86400000)
          : null,
        recommendedAction: probability > 0.7 ? 'Schedule immediate maintenance' : 'Continue monitoring',
        featureSnapshot: JSON.stringify({ scores: yVals, slope, currentScore }),
        createdAt: new Date()
      }
    })

    return { probability, estimatedDaysToFailure, confidence: 0.7 }
  }
}
