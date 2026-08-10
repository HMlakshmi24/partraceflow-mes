import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('AuditService');

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
    SESSION_REFRESHED = 'SESSION_REFRESHED',
    AUTH_FAILED = 'AUTH_FAILED',
    AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    ORDER_ACCESS_DENIED = 'ORDER_ACCESS_DENIED',
    ORDER_ADMIN_ACCESS = 'ORDER_ADMIN_ACCESS',
    SYSTEM_ERROR = 'SYSTEM_ERROR',
    AUDIT_CHANGE = 'AUDIT_CHANGE',
    USER_CREATED = 'USER_CREATED',
    USER_UPDATED = 'USER_UPDATED',
    USER_DEACTIVATED = 'USER_DEACTIVATED',
    USER_ACTIVATED = 'USER_ACTIVATED',
    USER_PASSWORD_RESET = 'USER_PASSWORD_RESET',
    REPORT_EXPORTED = 'REPORT_EXPORTED',
    MFA_ENROLLED = 'MFA_ENROLLED',
    MFA_DISABLED = 'MFA_DISABLED',
    MFA_VERIFIED = 'MFA_VERIFIED',
    MFA_FAILED = 'MFA_FAILED',
    MFA_BACKUP_CODE_USED = 'MFA_BACKUP_CODE_USED',
    MFA_BACKUP_CODES_REGENERATED = 'MFA_BACKUP_CODES_REGENERATED',
    MFA_ADMIN_RESET = 'MFA_ADMIN_RESET',
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
            log.error('failed to write audit log', { message: e instanceof Error ? e.message : String(e) });
        }
    }

    static computeDiffs(
        before: Record<string, unknown>,
        after: Record<string, unknown>,
    ): Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        const diffs: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> = [];
        for (const key of keys) {
            const oldStr = before[key] == null ? null : String(before[key]);
            const newStr = after[key] == null ? null : String(after[key]);
            if (oldStr !== newStr) diffs.push({ fieldName: key, oldValue: oldStr, newValue: newStr });
        }
        return diffs;
    }

    static async logDiffs(params: {
        entityType: string;
        entityId: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        changedBy: string;
        changedByRole?: string;
        changedByUserId?: string;
        transactionId?: string;
        eventType?: string;
        summary?: string;
    }) {
        const diffs = this.computeDiffs(params.before, params.after);
        if (diffs.length === 0) return;
        try {
            await Promise.all(
                diffs.map(d =>
                    prisma.auditDiff.create({
                        data: {
                            entityType: params.entityType,
                            entityId: params.entityId,
                            fieldName: d.fieldName,
                            oldValue: d.oldValue,
                            newValue: d.newValue,
                            changedBy: params.changedBy,
                            changedByRole: params.changedByRole ?? null,
                            changedByUserId: params.changedByUserId ?? null,
                            transactionId: params.transactionId ?? null,
                            eventType: params.eventType ?? null,
                            summary: params.summary ?? null,
                        },
                    }),
                ),
            );
        } catch (e) {
            log.error('failed to write audit diffs', { message: e instanceof Error ? e.message : String(e) });
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
        await AuditService.log(
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
        if (params.before && typeof params.before === 'object' && params.after && typeof params.after === 'object') {
            await AuditService.logDiffs({
                entityType: params.entity,
                entityId: params.entityId,
                before: params.before as Record<string, unknown>,
                after: params.after as Record<string, unknown>,
                changedBy: params.performedBy ?? 'system',
                changedByRole: params.role,
                changedByUserId: params.userId,
                eventType: params.action,
            });
        }
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
