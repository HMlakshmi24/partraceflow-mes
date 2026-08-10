import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { AndonService } from '@/lib/services/AndonService'
import { prisma } from '@/lib/services/database'
import { requireRole } from '@/lib/api-auth'

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

export async function GET(request: NextRequest) {
  // MEDIUM fix: this GET had no role check at all (only POST did) —
  // inconsistent with sibling read endpoints elsewhere in the app.
  const authError = await requireRole(request, ALL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get('boardId')
    const activeOnly = searchParams.get('active') === 'true'

    if (boardId) {
      const status = await AndonService.getBoardStatus(boardId)
      return NextResponse.json({ board: status })
    }

    if (activeOnly) {
      const alerts = await AndonService.getActiveAlerts()
      return NextResponse.json({ alerts })
    }

    const boards = await prisma.andonBoard.findMany({
      include: { displays: true },
      where: { isActive: true }
    })
    return NextResponse.json({ boards })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch andon data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'SUPERVISOR']);
  if (authError) return authError;

  try {
    const body = await request.json()
    const { action, ...data } = body

    if (action === 'trigger') {
      // Auto-create a default board if none exists or boardId is missing
      let boardId = data.boardId
      if (!boardId) {
        const existing = await prisma.andonBoard.findFirst({ where: { isActive: true } })
        if (existing) {
          boardId = existing.id
        } else {
          const board = await prisma.andonBoard.create({
            data: {
              code: 'MAIN-FLOOR',
              name: 'Main Floor Board',
              location: 'Factory Floor',
              isActive: true,
              displays: { create: [
                { zone: 'LINE-A', currentColor: 'GREEN' },
                { zone: 'LINE-B', currentColor: 'GREEN' },
                { zone: 'LINE-C', currentColor: 'GREEN' },
              ]},
            }
          })
          boardId = board.id
        }
      }
      const event = await AndonService.triggerAndon({ ...data, boardId })
      return NextResponse.json({ success: true, event })
    }

    if (action === 'acknowledge') {
      const event = await AndonService.acknowledgeAndon(data.eventId, data.userId)
      return NextResponse.json({ success: true, event })
    }

    if (action === 'resolve') {
      const event = await AndonService.resolveAndon(data.eventId)
      return NextResponse.json({ success: true, event })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
        return handleApiError('[POST /api/andon]', error);
  }
}
