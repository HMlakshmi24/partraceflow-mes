/**
 * Audit Chain Integrity Tests
 *
 * All tests operate on pure functions only — no database required.
 * Tests cover: hash determinism, tamper detection, chain integrity,
 * genesis block, and verify functions.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock DB so AuditChainService can be imported without a running database
vi.mock('@/lib/services/database', () => ({
    prisma: {
        auditChain: {
            findFirst: vi.fn(),
            create: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

import {
    computeHash,
    verifyChainEntries,
    NULL_HASH,
    type ChainEntry,
} from '@/lib/services/AuditChainService';

// ── Helper ────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<ChainEntry> & { i: number }): ChainEntry {
    const day = String(overrides.i + 1).padStart(2, '0');
    const ts = new Date(`2025-01-${day}T00:00:00.000Z`);
    const base: Omit<ChainEntry, 'previousHash' | 'currentHash'> = {
        entityType: overrides.entityType ?? 'PipeSpool',
        entityId: overrides.entityId ?? 'spool-001',
        action: overrides.action ?? 'SPOOL_STATUS_CHANGE',
        payload: overrides.payload ?? JSON.stringify({ oldStatus: 'ISSUED', newStatus: 'FIT_UP' }),
        timestamp: ts,
    };
    const previousHash = overrides.previousHash ?? NULL_HASH;
    const currentHash = overrides.currentHash ?? computeHash(
        previousHash,
        base.entityType,
        base.entityId,
        base.action,
        ts.toISOString(),
        base.payload,
    );
    return { ...base, previousHash, currentHash };
}

function buildChain(length: number, entityId = 'spool-001'): ChainEntry[] {
    const entries: ChainEntry[] = [];
    for (let i = 0; i < length; i++) {
        const prev = i === 0 ? NULL_HASH : entries[i - 1].currentHash;
        entries.push(makeEntry({ i, entityId, previousHash: prev }));
    }
    return entries;
}

// ── computeHash ───────────────────────────────────────────────────────────────

describe('computeHash', () => {
    it('produces a 64-character hex string (SHA-256)', () => {
        const h = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'STATUS_CHANGE', '2025-01-01T00:00:00.000Z', '{}');
        expect(h).toHaveLength(64);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same inputs produce same hash', () => {
        const h1 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'STATUS_CHANGE', '2025-01-01T00:00:00.000Z', '{}');
        const h2 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'STATUS_CHANGE', '2025-01-01T00:00:00.000Z', '{}');
        expect(h1).toBe(h2);
    });

    it('changes when previousHash changes', () => {
        const h1 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{}');
        const h2 = computeHash('a'.repeat(64), 'PipeSpool', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{}');
        expect(h1).not.toBe(h2);
    });

    it('changes when entityType changes', () => {
        const h1 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{}');
        const h2 = computeHash(NULL_HASH, 'SpoolJoint', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{}');
        expect(h1).not.toBe(h2);
    });

    it('changes when entityId changes', () => {
        const h1 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{}');
        const h2 = computeHash(NULL_HASH, 'PipeSpool', 'sp-2', 'ACT', '2025-01-01T00:00:00.000Z', '{}');
        expect(h1).not.toBe(h2);
    });

    it('changes when action changes', () => {
        const h1 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'STATUS_CHANGE', '2025-01-01T00:00:00.000Z', '{}');
        const h2 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'SOFT_DELETE', '2025-01-01T00:00:00.000Z', '{}');
        expect(h1).not.toBe(h2);
    });

    it('changes when timestamp changes', () => {
        const h1 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{}');
        const h2 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'ACT', '2025-01-02T00:00:00.000Z', '{}');
        expect(h1).not.toBe(h2);
    });

    it('changes when payload changes', () => {
        const h1 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{"old":"A"}');
        const h2 = computeHash(NULL_HASH, 'PipeSpool', 'sp-1', 'ACT', '2025-01-01T00:00:00.000Z', '{"old":"B"}');
        expect(h1).not.toBe(h2);
    });

    it('NULL_HASH is 64 zeros', () => {
        expect(NULL_HASH).toHaveLength(64);
        expect(NULL_HASH).toBe('0'.repeat(64));
    });
});

// ── verifyChainEntries ────────────────────────────────────────────────────────

describe('verifyChainEntries — valid chains', () => {
    it('returns valid=true for an empty chain', () => {
        const result = verifyChainEntries([]);
        expect(result.valid).toBe(true);
        expect(result.total).toBe(0);
    });

    it('returns valid=true for a single-entry genesis block', () => {
        const chain = buildChain(1);
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(true);
        expect(result.total).toBe(1);
    });

    it('validates a 5-entry chain', () => {
        const chain = buildChain(5);
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(true);
        expect(result.total).toBe(5);
    });

    it('validates a 10-entry chain', () => {
        const chain = buildChain(10);
        expect(verifyChainEntries(chain).valid).toBe(true);
    });
});

// ── verifyChainEntries — tamper detection ─────────────────────────────────────

describe('verifyChainEntries — tamper detection', () => {
    it('detects a tampered payload in entry 0', () => {
        const chain = buildChain(3);
        chain[0] = { ...chain[0], payload: '{"tampered":true}' };
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(false);
        expect(result.brokenAt).toBe(0);
        expect(result.reason).toContain('currentHash mismatch');
    });

    it('detects a tampered payload in a middle entry', () => {
        const chain = buildChain(5);
        chain[2] = { ...chain[2], payload: '{"evil":"inject"}' };
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(false);
        expect(result.brokenAt).toBe(2);
    });

    it('detects a tampered action field', () => {
        const chain = buildChain(3);
        chain[1] = { ...chain[1], action: 'TAMPERED_ACTION' };
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(false);
        expect(result.brokenAt).toBe(1);
    });

    it('detects a broken previousHash link', () => {
        const chain = buildChain(4);
        // Break the link: entry 2 points to wrong previous
        chain[2] = { ...chain[2], previousHash: NULL_HASH };
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(false);
        expect(result.brokenAt).toBe(2);
        expect(result.reason).toContain('previousHash mismatch');
    });

    it('detects an injected entry in the middle', () => {
        const chain = buildChain(4);
        // Inject a forged entry between index 1 and 2 without relinking
        const forged = makeEntry({ i: 4, action: 'FORGED', previousHash: chain[1].currentHash });
        chain.splice(2, 0, forged);
        // chain[3].previousHash still points to chain[1].currentHash, not forged
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(false);
    });

    it('detects a deleted entry (gap in chain)', () => {
        const chain = buildChain(5);
        // Simulate deleting entry 2 — entry 3 now has wrong previousHash
        const withGap = [chain[0], chain[1], chain[3], chain[4]];
        const result = verifyChainEntries(withGap);
        expect(result.valid).toBe(false);
        expect(result.brokenAt).toBe(2);
    });

    it('detects hash replacement without payload change', () => {
        const chain = buildChain(3);
        // Replace currentHash with a valid-looking but wrong hash
        chain[0] = { ...chain[0], currentHash: 'b'.repeat(64) };
        const result = verifyChainEntries(chain);
        expect(result.valid).toBe(false);
        expect(result.brokenAt).toBe(0);
    });
});

// ── Cross-entity isolation ────────────────────────────────────────────────────

describe('verifyChainEntries — entity isolation', () => {
    it('each entity starts with NULL_HASH as previousHash', () => {
        const chainA = buildChain(3, 'spool-A');
        const chainB = buildChain(3, 'spool-B');
        expect(chainA[0].previousHash).toBe(NULL_HASH);
        expect(chainB[0].previousHash).toBe(NULL_HASH);
        expect(chainA[0].currentHash).not.toBe(chainB[0].currentHash);
    });

    it('verifies two independent chains correctly', () => {
        const chainA = buildChain(4, 'spool-A');
        const chainB = buildChain(6, 'spool-B');
        expect(verifyChainEntries(chainA).valid).toBe(true);
        expect(verifyChainEntries(chainB).valid).toBe(true);
    });
});
