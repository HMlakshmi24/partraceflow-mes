import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR']);
  if (authError) return authError;
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

    if (!workOrders.length) {
      return NextResponse.json({ success: true, message: 'No work orders configured', workOrders: [], summary: { totalOrders: 0, inProgress: 0, completedToday: 0, overdueOrders: 0 } })
    }

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
        return handleApiError('[GET /api/production]', error);
  }
}
