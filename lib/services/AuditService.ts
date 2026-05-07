import { prisma } from '@/lib/services/database';

export enum EventType {
    WORKFLOW_START = 'WORKFLOW_START',
    WORKFLOW_COMPLETE = 'WORKFLOW_COMPLETE',
    TASK_ASSIGNED = 'TASK_ASSIGNED',
    TASK_STARTED = 'TASK_STARTED',
    TASK_COMPLETED = 'TASK_COMPLETED',
    TASK_BLOCKED = 'TASK_BLOCKED',
    QUALITY_CHECK = 'QUALITY_CHECK',
    QUALITY_PASS = 'QUALITY_PASS',
    QUALITY_FAIL = 'QUALITY_FAIL',
    ORDER_STATUS_CHANGE = 'ORDER_STATUS_CHANGE',
    ORDER_CREATED = 'ORDER_CREATED',
    ORDER_NOTE = 'ORDER_NOTE',
    ORDER_CANCELLED = 'ORDER_CANCELLED',
    ORDER_ON_HOLD = 'ORDER_ON_HOLD',
    ORDER_REWORK = 'ORDER_REWORK',
    ORDER_COMPLETED = 'ORDER_COMPLETED',
    ORDER_OVERDUE = 'ORDER_OVERDUE',
    AUTH_LOGIN = 'AUTH_LOGIN',
    AUTH_LOGOUT = 'AUTH_LOGOUT',
    AUTH_FAILED = 'AUTH_FAILED',
    AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    ORDER_ACCESS_DENIED = 'ORDER_ACCESS_DENIED',
    ORDER_ADMIN_ACCESS = 'ORDER_ADMIN_ACCESS',
    SYSTEM_ERROR = 'SYSTEM_ERROR',
    AUDIT_CHANGE = 'AUDIT_CHANGE',
}

interface AuditContext {
    [key: string]: unknown;
}

interface AuditEntry {
    eventType: EventType;
    summary: string;
    timestamp: string;
    userId?: string | null;
    context: AuditContext;
}

export class AuditService {
    static async log(type: EventType, summary: string, context: AuditContext = {}, userId?: string) {
        try {
            const entry: AuditEntry = {
                eventType: type,
                summary,
                timestamp: new Date().toISOString(),
                userId: userId ?? null,
                context,
            };
            await prisma.systemEvent.create({
                data: {
                    eventType: type,
                    details: JSON.stringify(entry),
                    userId: userId ?? null,
                    timestamp: new Date(),
                },
            });
        } catch (e) {
            console.error('[AuditService] Failed to write audit log:', e);
        }
    }

    static async logChange(params: {
        action: string;
        entity: string;
        entityId: string;
        before: unknown;
        after: unknown;
        userId?: string;
        performedBy?: string;
        role?: string;
    }) {
        return AuditService.log(
            EventType.AUDIT_CHANGE,
            `${params.action} on ${params.entity} ${params.entityId}`,
            {
                action: params.action,
                entity: params.entity,
                entityId: params.entityId,
                before: params.before,
                after: params.after,
                performedBy: params.performedBy ?? null,
                role: params.role ?? null,
            },
            params.userId,
        );
    }

    static async logPermissionDenied(params: { userId?: string; username?: string; role?: string; resource: string; action: string }) {
        return AuditService.log(
            EventType.PERMISSION_DENIED,
            `Permission denied: ${params.role ?? 'unknown'} attempted ${params.action} on ${params.resource}`,
            {
                username: params.username ?? null,
                role: params.role ?? null,
                resource: params.resource,
                action: params.action,
            },
            params.userId,
        );
    }

    static async logAuthEvent(type: EventType.AUTH_LOGIN | EventType.AUTH_FAILED | EventType.AUTH_LOGOUT, params: { username: string; userId?: string; reason?: string }) {
        return AuditService.log(
            type,
            `${type === EventType.AUTH_LOGIN ? 'Login' : type === EventType.AUTH_LOGOUT ? 'Logout' : 'Login failed'} for "${params.username}"`,
            { username: params.username, reason: params.reason ?? null },
            params.userId,
        );
    }
}
