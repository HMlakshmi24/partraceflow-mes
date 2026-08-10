import { NextRequest, NextResponse } from 'next/server'
import { NotificationService } from '@/lib/services/NotificationService'
import { requireRole } from '@/lib/api-auth';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, ALL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url)
    const recipientId = searchParams.get('recipientId')

    if (!recipientId) {
      return NextResponse.json({ error: 'recipientId required' }, { status: 400 })
    }

    const notifications = await NotificationService.getUnread(recipientId)
    return NextResponse.json({ notifications })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
