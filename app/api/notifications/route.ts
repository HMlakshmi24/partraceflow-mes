import { NextRequest, NextResponse } from 'next/server'
import { NotificationService } from '@/lib/services/NotificationService'

export async function GET(request: NextRequest) {
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
