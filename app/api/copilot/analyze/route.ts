import { NextRequest, NextResponse } from 'next/server'
import { MESCopilotService } from '@/lib/services/MESCopilotService'
import { prisma } from '@/lib/services/database'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, sessionId, userId } = body

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'question is required' }, { status: 400 })
    }

    // Get or create session
    let session
    if (sessionId) {
      session = await prisma.copilotSession.findUnique({ where: { id: sessionId } })
    }
    if (!session) {
      session = await prisma.copilotSession.create({
        data: { userId, context: '{}', updatedAt: new Date() }
      })
    }

    const response = await MESCopilotService.query(session.id, question)

    return NextResponse.json({
      sessionId: session.id,
      question,
      ...response
    })
  } catch (error) {
    console.error('[POST /api/copilot/analyze]', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const session = await prisma.copilotSession.findUnique({
      where: { id: sessionId },
      include: { queries: { orderBy: { timestamp: 'asc' } } }
    })

    return NextResponse.json({ session })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
  }
}
