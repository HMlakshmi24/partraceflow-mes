import { prisma } from '@/lib/services/database';

export enum EventType {
    WORKFLOW_START = 'WORKFLOW_START',
    WORKFLOW_COMPLETE = 'WORKFLOW_COMPLETE',
    TASK_ASSIGNED = 'TASK_ASSIGNED',
    TASK_COMPLETED = 'TASK_COMPLETED',
    QUALITY_CHECK = 'QUALITY_CHECK',
    SYSTEM_ERROR = 'SYSTEM_ERROR',
    AUDIT_CHANGE = 'AUDIT_CHANGE'
}

export class AuditService {
    static async log(type: EventType, details: string, context: any = {}, userId?: string) {
        try {
            await prisma.systemEvent.create({
                data: {
                    eventType: type,
                    details: details + (Object.keys(context).length ? ` | Data: ${JSON.stringify(context)}` : ''),
                    userId: userId,
                    timestamp: new Date()
                }
            });
            console.log(`[AUDIT] ${type}: ${details}`);
        } catch (e) {
            console.error('Failed to write audit log', e);
        }
    }

    static async logChange(params: {
        action: string;
        entity: string;
        entityId: string;
        before: any;
        after: any;
        userId?: string;
    }) {
        const details = JSON.stringify({
            action: params.action,
            entity: params.entity,
            entityId: params.entityId,
            before: params.before,
            after: params.after,
            userId: params.userId ?? null,
        });
        return AuditService.log(EventType.AUDIT_CHANGE, details, {}, params.userId);
    }
}
