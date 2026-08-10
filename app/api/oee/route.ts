import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { OEEService } from '@/lib/services/OEEService'
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY']);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url)
    const machineId = searchParams.get('machineId')
    const plantId = searchParams.get('plantId')
    const hoursBack = Math.max(1, parseInt(searchParams.get('hours') ?? '8') || 8)

    const toDate = new Date()
    const fromDate = new Date(toDate.getTime() - hoursBack * 3600000)

    if (machineId) {
      const result = await OEEService.calculateOEE(machineId, fromDate, toDate)
      return NextResponse.json(result)
    }

    if (plantId) {
      const results = await OEEService.calculatePlantOEE(plantId, fromDate, toDate)
      const avg = results.reduce((acc, r) => ({
        oee: acc.oee + r.oee / results.length,
        availability: acc.availability + r.availability / results.length,
        performance: acc.performance + r.performance / results.length,
        quality: acc.quality + r.quality / results.length
      }), { oee: 0, availability: 0, performance: 0, quality: 0 })
      return NextResponse.json({ plantId, machines: results, average: avg })
    }

    // All machines
    const machines = await prisma.machine.findMany({ take: 500 })
    const results = await Promise.allSettled(
      machines.map(m => OEEService.calculateOEE(m.id, fromDate, toDate))
    )
    const oeeData = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value)

    return NextResponse.json({ machines: oeeData, period: { from: fromDate, to: toDate } })
  } catch (error) {
        return handleApiError('[GET /api/oee]', error);
  }
}
