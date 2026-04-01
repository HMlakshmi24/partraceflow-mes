import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/services/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const plantId = searchParams.get('plantId')
    const status = searchParams.get('status') ?? 'RELEASED'

    const workOrders = await prisma.workOrder.findMany({
      where: {
        status,
        ...(plantId && { /* filter by plant through machine */ })
      },
      include: {
        product: true,
        workflowInstances: {
          include: {
            tasks: {
              include: {
                machine: true,
                operator: true
              }
            }
          }
        }
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }]
    })

    const summary = {
      totalOrders: workOrders.length,
      inProgress: workOrders.filter(wo =>
        wo.workflowInstances.some(i => i.status === 'ACTIVE')
      ).length,
      completedToday: workOrders.filter(wo => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return wo.workflowInstances.some(i =>
          i.status === 'COMPLETED'
        )
      }).length,
      overdueOrders: workOrders.filter(wo => new Date(wo.dueDate) < new Date()).length
    }

    return NextResponse.json({ workOrders, summary })
  } catch (error) {
    console.error('[GET /api/production]', error)
    return NextResponse.json({ error: 'Failed to fetch production data' }, { status: 500 })
  }
}
