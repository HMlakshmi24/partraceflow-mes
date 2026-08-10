/**
 * StatusHistoryService
 *
 * Writes spool and joint status changes into the existing AuditDiff table so
 * every transition has a queryable record with:
 *   createdBy / updatedBy (changedBy + changedByUserId)
 *   role       (changedByRole)
 *   timestamp  (auto from DB)
 *   oldStatus  (oldValue)
 *   newStatus  (newValue)
 *
 * Writes are non-fatal — a failure never blocks the main state transition.
 */

import { prisma } from './database';
import { appendChain } from './AuditChainService';
import { createLogger } from '@/lib/logger';

const log = createLogger('StatusHistoryService');

export type StatusActor = {
    changedBy: string;        // username or 'system'
    changedByUserId?: string;
    changedByRole?: string;
};

export async function recordStatusChange(
    entityType: 'PipeSpool' | 'SpoolJoint',
    entityId: string,
    oldStatus: string,
    newStatus: string,
    actor: StatusActor,
    notes?: string,
): Promise<void> {
    const action = entityType === 'PipeSpool' ? 'SPOOL_STATUS_CHANGE' : 'JOINT_STATUS_CHANGE';

    await prisma.auditDiff.create({
        data: {
            entityType,
            entityId,
            fieldName: 'status',
            oldValue: oldStatus,
            newValue: newStatus,
            changedBy: actor.changedBy,
            changedByRole: actor.changedByRole ?? null,
            changedByUserId: actor.changedByUserId ?? null,
            eventType: action,
            summary: `${oldStatus} → ${newStatus}${notes ? ` — ${notes}` : ''}`,
        },
    }).catch((e) => {
        log.error('failed to write status history', { message: e instanceof Error ? e.message : String(e) });
    });

    // Every status transition is also anchored to the immutable audit chain.
    // HIGH-9 fix: this used to be a silent `.catch(() => {})` with zero
    // logging — if the hash-chain write failed, there was no operational
    // signal at all, letting the "tamper-evident" chain silently develop
    // gaps. appendChain() itself already logs internally and never rejects,
    // but this catch stays as defense-in-depth against that contract
    // changing, and to make the failure visible here too.
    await appendChain({
        entityType,
        entityId,
        action,
        userId: actor.changedByUserId,
        payload: {
            oldStatus,
            newStatus,
            changedBy: actor.changedBy,
            changedByRole: actor.changedByRole ?? null,
            notes: notes ?? null,
        },
    }).catch((e) => {
        log.error('failed to append audit chain entry', { message: e instanceof Error ? e.message : String(e), entityType, entityId });
    });
}

/**
 * Retrieve ordered status history for a spool or joint.
 * Returns newest-first.
 */
export async function getStatusHistory(
    entityType: 'PipeSpool' | 'SpoolJoint',
    entityId: string,
) {
    return prisma.auditDiff.findMany({
        where: { entityType, entityId, fieldName: 'status' },
        orderBy: { timestamp: 'desc' },
        select: {
            id: true,
            oldValue: true,
            newValue: true,
            changedBy: true,
            changedByRole: true,
            changedByUserId: true,
            timestamp: true,
            summary: true,
        },
    });
}

export const SYSTEM_ACTOR: StatusActor = {
    changedBy: 'system',
    changedByRole: 'SYSTEM',
};
