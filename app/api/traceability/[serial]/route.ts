import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { TraceabilityService } from '@/lib/services/TraceabilityService'
import { requireRole } from '@/lib/api-auth';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const authError = await requireRole(request, ALL_ROLES);
  if (authError) return authError;

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
        return handleApiError('[GET /api/traceability]', error);
  }
}
