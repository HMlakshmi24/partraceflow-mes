import { prisma } from '@/lib/services/database';

export type EventType = 'ORDER_CREATED' | 'ORDER_STARTED' | 'QUALITY_CHECK' | 'MACHINE_STOP' | 'USER_LOGIN';

export class EventBus {
    static async publish(type: EventType, details: any, user: string = 'SYSTEM') {
        const event = {
            id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            type,
            details: typeof details === 'string' ? details : JSON.stringify(details),
            user
        };

        console.log(`[EVENT-BUS] ${type}:`, details);

        // 1. Persist to Audit Log using Prisma
        try {
            await prisma.systemEvent.create({
                data: {
                    eventType: type,
                    details: typeof details === 'string' ? details : JSON.stringify(details),
                    timestamp: new Date()
                }
            });
        } catch (err) {
            console.error('Failed to persist event:', err);
        }

        // 2. Mock MQTT Publish
        // mqttClient.publish(`mes/${type}`, JSON.stringify(event));

        // 3. Trigger Workflows (Mock)
        // WorkflowEngine.evaluate(event);

        return event;
    }
}
