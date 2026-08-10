import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { BottleneckDetectionService } from '@/lib/services/BottleneckDetectionService'
import { requireRole } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url)
    const plantId = searchParams.get('plantId') ?? undefined
    const bottlenecks = await BottleneckDetectionService.scanPlant(plantId)
    return NextResponse.json({ bottlenecks, count: bottlenecks.length, scannedAt: new Date() })
  } catch (error) {
        return handleApiError('[GET /api/bottleneck/scan]', error);
  }
}
