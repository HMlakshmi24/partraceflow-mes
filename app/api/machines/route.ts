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
    const demoMachines = [
      { id: 'demo-cnc-01', code: 'CNC-01', name: 'CNC Milling Center', status: 'RUNNING' },
      { id: 'demo-assy-01', code: 'ASSY-01', name: 'Assembly Station A', status: 'IDLE' },
      { id: 'demo-prs-01', code: 'PRS-01', name: 'Pressure Test Rig', status: 'IDLE' },
      { id: 'demo-qc-01', code: 'QC-GATE', name: 'Inspection Station', status: 'RUNNING' },
    ];
    return NextResponse.json(
      {
        machines: demoMachines,
        degraded: true,
        warning: 'Database unavailable. Returning demo machine list.',
      },
      { status: 200 }
    )
  }
}
