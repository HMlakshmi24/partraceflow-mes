import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'MAINTENANCE', 'QC', 'QUALITY']);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url)
    const plantId = searchParams.get('plantId')
    const status = searchParams.get('status')

    const machines = await prisma.machine.findMany({
      where: {
        ...(status && { status }),
        ...(plantId && {
          productionLine: {
            area: { plant: { id: plantId } }
          }
        })
      },
      include: {
        productionLine: { include: { area: { include: { plant: true } } } },
        components: true,
        signals: { where: { isActive: true } }
      }
    })

    const normalized = machines.map(m => ({
      ...m,
      status: m.status === 'ACTIVE' ? 'IDLE' : m.status,
    }));
    return NextResponse.json({ machines: normalized })
  } catch (error) {
        return handleApiError('[GET /api/machines]', error);
  }
}
