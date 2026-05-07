import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const authError = requireRole(request, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'MAINTENANCE', 'QC', 'QUALITY']);
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

    return NextResponse.json({ machines })
  } catch (error) {
    console.error('[GET /api/machines]', error)
    return NextResponse.json({ error: 'Failed to fetch machines' }, { status: 500 })
  }
}
