import { NextRequest } from 'next/server'
import { eventBus, MESEvent } from '@/lib/events/EventBus'

// Server-Sent Events endpoint for real-time factory updates
// Clients connect once and receive live events: machine status, tasks, OEE, alerts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const plantId = searchParams.get('plantId')
  const machineId = searchParams.get('machineId')

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection acknowledgment
      const welcome = `data: ${JSON.stringify({ type: 'connected', timestamp: new Date() })}\n\n`
      controller.enqueue(encoder.encode(welcome))

      // Subscribe to all MES events
      const unsubscribe = eventBus.subscribe('*', (event: MESEvent) => {
        // Filter by plant/machine if requested
        if (plantId && event.plantId && event.plantId !== plantId) return
        if (machineId && event.machineId && event.machineId !== machineId) return

        const data = `data: ${JSON.stringify(event)}\n\n`
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // Client disconnected
          unsubscribe()
        }
      })

      // Send heartbeat every 15 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
          unsubscribe()
        }
      }, 15000)

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no' // disable nginx buffering
    }
  })
}
