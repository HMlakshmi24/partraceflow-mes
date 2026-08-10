/**
 * AuditChainService — Immutable SHA-256 hash chain for workflow events.
 *
 * Each entry links to the previous via:
 *   currentHash = SHA256(previousHash + entityType + entityId + action + timestamp + payload)
 *
 * Records in AuditChain must never be edited or deleted. The hash chain
 * makes any tampering detectable via verifyChainEntries().
 */

import crypto from 'crypto';
import { prisma } from './database';
import { createLogger } from '@/lib/logger';

const log = createLogger('AuditChainService');

export const NULL_HASH = '0'.repeat(64);

// ── Pure functions (exported for testing without DB) ─────────────────────────

export function computeHash(
  previousHash: string,
  entityType: string,
  entityId: string,
  action: string,
  timestamp: string,
  payload: string,
): string {
  return crypto
    .createHash('sha256')
    .update(previousHash + entityType + entityId + action + timestamp + payload)
    .digest('hex');
}

export interface ChainEntry {
  entityType: string;
  entityId: string;
  action: string;
  previousHash: string;
  currentHash: string;
  payload: string;
  timestamp: Date | string;
}

export interface ChainVerifyResult {
  valid: boolean;
  total: number;
  brokenAt?: number;
  reason?: string;
}

/**
 * Pure function — verifies an ordered array of chain entries (oldest first).
 * No DB required. Used directly in tests.
 */
export function verifyChainEntries(entries: ChainEntry[]): ChainVerifyResult {
  if (entries.length === 0) return { valid: true, total: 0 };

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const ts = e.timestamp instanceof Date
      ? e.timestamp.toISOString()
      : e.timestamp;

    // previousHash must chain from the entry before (or NULL_HASH for first)
    const expectedPrev = i === 0 ? NULL_HASH : entries[i - 1].currentHash;
    if (e.previousHash !== expectedPrev) {
      return {
        valid: false,
        total: entries.length,
        brokenAt: i,
        reason: `Entry ${i}: previousHash mismatch (chain broken)`,
      };
    }

    // currentHash must match the computed value
    const expected = computeHash(
      e.previousHash,
      e.entityType,
      e.entityId,
      e.action,
      ts,
      e.payload,
    );
    if (e.currentHash !== expected) {
      return {
        valid: false,
        total: entries.length,
        brokenAt: i,
        reason: `Entry ${i}: currentHash mismatch (payload tampered)`,
      };
    }
  }

  return { valid: true, total: entries.length };
}

// ── DB-backed functions ───────────────────────────────────────────────────────

/**
 * Append a new entry to the chain for the given entity.
 * Reads the most recent hash, computes the next, writes atomically.
 * Non-fatal: errors are logged but never bubble up to block the caller.
 *
 * HIGH-5 fix: the read-last-hash-then-create was previously two separate,
 * unsynchronized queries — two concurrent appendChain() calls for the same
 * (entityType, entityId) could both read the same previousHash and both
 * insert an entry claiming the same predecessor, forking the chain this
 * service exists to make tamper-evident. It's now a Serializable
 * transaction with a few retries on write-conflict, since this is called as
 * a side-effect on every status change and genuine concurrent writes to the
 * same entity are expected, not exceptional.
 */
export async function appendChain(params: {
  entityType: string;
  entityId: string;
  action: string;
  userId?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const last = await tx.auditChain.findFirst({
          where: { entityType: params.entityType, entityId: params.entityId },
          orderBy: { timestamp: 'desc' },
          select: { currentHash: true },
        });

        const previousHash = last?.currentHash ?? NULL_HASH;
        const timestamp = new Date().toISOString();
        const payloadStr = JSON.stringify(params.payload);

        const currentHash = computeHash(
          previousHash,
          params.entityType,
          params.entityId,
          params.action,
          timestamp,
          payloadStr,
        );

        await tx.auditChain.create({
          data: {
            entityType: params.entityType,
            entityId: params.entityId,
            action: params.action,
            userId: params.userId ?? null,
            previousHash,
            currentHash,
            payload: payloadStr,
            timestamp: new Date(timestamp),
          },
        });
      }, { isolationLevel: 'Serializable' });
      return;
    } catch (e: any) {
      if (e?.code === 'P2034' && attempt < MAX_ATTEMPTS) {
        continue; // write conflict — another appendChain() for this entity committed first, retry
      }
      log.error('failed to append chain entry', { message: e instanceof Error ? e.message : String(e), attempt });
      return;
    }
  }
}

/**
 * Verify the full chain for an entity from the DB.
 * Returns { valid, total, brokenAt?, reason? }.
 */
export async function verifyChain(
  entityType: string,
  entityId: string,
): Promise<ChainVerifyResult> {
  const entries = await prisma.auditChain.findMany({
    where: { entityType, entityId },
    orderBy: { timestamp: 'asc' },
  });
  return verifyChainEntries(entries);
}
