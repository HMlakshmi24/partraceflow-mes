import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/services/database'

export async function GET(request: NextRequest) {
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
