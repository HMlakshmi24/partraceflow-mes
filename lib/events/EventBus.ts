// Internal event bus using Node.js EventEmitter
// Provides decoupled service communication within the MES
// For production scale: replace emitter with Kafka/RabbitMQ/NATS

import { EventEmitter } from 'events'

export type MESEventType =
  | 'machine.status.changed'
  | 'machine.telemetry.received'
  | 'machine.alarm'
  | 'task.started'
  | 'task.completed'
  | 'task.rework'
  | 'quality.failed'
  | 'quality.approved'
  | 'downtime.started'
  | 'downtime.ended'
  | 'order.created'
  | 'order.completed'
  | 'shift.started'
  | 'shift.ended'
  | 'andon.triggered'
  | 'bottleneck.detected'
  | 'maintenance.predicted'
  | 'spc.violation'
  | 'notification.send'

export interface MESEvent<T = Record<string, unknown>> {
  type: MESEventType
  payload: T
  timestamp: Date
  source: string      // service that emitted
  machineId?: string
  plantId?: string
  workOrderId?: string
}

class MESEventBus extends EventEmitter {
  private static instance: MESEventBus

  private constructor() {
    super()
    this.setMaxListeners(100) // large factories have many listeners
  }

  static getInstance(): MESEventBus {
    if (!MESEventBus.instance) {
      MESEventBus.instance = new MESEventBus()
    }
    return MESEventBus.instance
  }

  publish<T = Record<string, unknown>>(event: Omit<MESEvent<T>, 'timestamp'>): void {
    const fullEvent: MESEvent<T> = {
      ...event,
      timestamp: new Date()
    }
    this.emit(event.type, fullEvent)
    this.emit('*', fullEvent) // wildcard listener for logging/SSE
    console.log(`[EventBus] ${event.type} from ${event.source}`)
  }

  subscribe<T = Record<string, unknown>>(
    eventType: MESEventType | '*',
    handler: (event: MESEvent<T>) => void
  ): () => void {
    this.on(eventType, handler)
    // Return unsubscribe function
    return () => this.off(eventType, handler)
  }

  subscribeOnce<T = Record<string, unknown>>(
    eventType: MESEventType,
    handler: (event: MESEvent<T>) => void
  ): void {
    this.once(eventType, handler)
  }
}

export const eventBus = MESEventBus.getInstance()
