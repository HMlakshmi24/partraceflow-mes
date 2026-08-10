/**
 * ElectronicSignatureService — payload-hash tamper-evidence.
 *
 * Covers the industry-readiness fix that binds a signature to the exact
 * decision content it was issued for (hashSignaturePayload), not just
 * entityType/entityId/user/time-window as before. Uses a mocked Prisma
 * client so requireSignature/verifySignatureForEntity can be exercised
 * without a real DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUser, mockSignature } = vi.hoisted(() => ({
    mockUser: { findUnique: vi.fn() },
    mockSignature: { create: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: { user: mockUser, electronicSignature: mockSignature },
}));

import {
    hashSignaturePayload,
    requireSignature,
    verifySignatureForEntity,
} from '@/lib/services/ElectronicSignatureService';
import { hashPassword } from '@/lib/auth';

const PASSWORD = 'Correct-Horse-Battery-Staple-1!';
const PASSWORD_HASH = hashPassword(PASSWORD);

beforeEach(() => {
    vi.clearAllMocks();
});

// ── hashSignaturePayload (pure) ──────────────────────────────────────────────

describe('hashSignaturePayload', () => {
    it('is deterministic for the same payload', () => {
        const payload = { result: 'PASS', notes: 'looks good', clientApproved: true };
        expect(hashSignaturePayload(payload)).toBe(hashSignaturePayload(payload));
    });

    it('is independent of object key order', () => {
        const a = hashSignaturePayload({ result: 'PASS', notes: 'x', clientApproved: true });
        const b = hashSignaturePayload({ clientApproved: true, notes: 'x', result: 'PASS' });
        expect(a).toBe(b);
    });

    it('produces a different hash when a value changes', () => {
        const a = hashSignaturePayload({ result: 'PASS' });
        const b = hashSignaturePayload({ result: 'FAIL' });
        expect(a).not.toBe(b);
    });

    it('produces a different hash for nested payloads with different structure', () => {
        const a = hashSignaturePayload({ nextStatus: 'APPROVED' });
        const b = hashSignaturePayload({ status: 'APPROVED' });
        expect(a).not.toBe(b);
    });

    it('preserves array order as meaningful', () => {
        const a = hashSignaturePayload({ items: ['a', 'b'] });
        const b = hashSignaturePayload({ items: ['b', 'a'] });
        expect(a).not.toBe(b);
    });

    it('is stable across nested key reordering', () => {
        const a = hashSignaturePayload({ outer: { z: 1, a: 2 }, top: true });
        const b = hashSignaturePayload({ top: true, outer: { a: 2, z: 1 } });
        expect(a).toBe(b);
    });

    it('returns a 64-char hex SHA-256 digest', () => {
        expect(hashSignaturePayload({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
    });
});

// ── requireSignature: stores payloadHash when payload is provided ───────────

describe('requireSignature — payload hash storage', () => {
    it('stores a payloadHash when payload is supplied', async () => {
        mockUser.findUnique.mockResolvedValue({ id: 'u1', passwordHash: PASSWORD_HASH, isActive: true });
        mockSignature.create.mockResolvedValue({ id: 'sig-1' });

        const result = await requireSignature({
            userId: 'u1', password: PASSWORD, entityType: 'SpoolInspection', entityId: 'insp-1',
            reason: 'Recording inspection result', payload: { result: 'PASS', notes: null, clientApproved: false },
        });

        expect(result.ok).toBe(true);
        expect(mockSignature.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                payloadHash: hashSignaturePayload({ result: 'PASS', notes: null, clientApproved: false }),
            }),
        });
    });

    it('stores payloadHash: null when no payload is supplied', async () => {
        mockUser.findUnique.mockResolvedValue({ id: 'u1', passwordHash: PASSWORD_HASH, isActive: true });
        mockSignature.create.mockResolvedValue({ id: 'sig-1' });

        await requireSignature({ userId: 'u1', password: PASSWORD, entityType: 'X', entityId: 'y', reason: 'r' });

        expect(mockSignature.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ payloadHash: null }),
        });
    });

    it('never creates a signature when the password is wrong', async () => {
        mockUser.findUnique.mockResolvedValue({ id: 'u1', passwordHash: PASSWORD_HASH, isActive: true });

        const result = await requireSignature({
            userId: 'u1', password: 'wrong-password', entityType: 'X', entityId: 'y', reason: 'r',
        });

        expect(result.ok).toBe(false);
        expect(mockSignature.create).not.toHaveBeenCalled();
    });
});

// ── verifySignatureForEntity: payload tamper-evidence ────────────────────────

describe('verifySignatureForEntity — payload tamper-evidence', () => {
    const baseSig = {
        id: 'sig-1', userId: 'u1', entityType: 'SpoolInspection', entityId: 'insp-1',
        timestamp: new Date(), payloadHash: hashSignaturePayload({ result: 'PASS', notes: null, clientApproved: false }),
    };

    it('accepts when the submitted payload matches the signed payload', async () => {
        mockSignature.findUnique.mockResolvedValue(baseSig);

        const result = await verifySignatureForEntity({
            signatureId: 'sig-1', userId: 'u1', entityType: 'SpoolInspection', entityId: 'insp-1',
            payload: { result: 'PASS', notes: null, clientApproved: false },
        });

        expect(result.ok).toBe(true);
    });

    it('rejects when the submitted payload differs from what was signed (tampered content)', async () => {
        mockSignature.findUnique.mockResolvedValue(baseSig);

        const result = await verifySignatureForEntity({
            signatureId: 'sig-1', userId: 'u1', entityType: 'SpoolInspection', entityId: 'insp-1',
            // Same signatureId/user/entity, but the decision itself changed
            // (PASS -> FAIL) after the signature was issued.
            payload: { result: 'FAIL', notes: null, clientApproved: false },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/no longer matches what was signed/i);
    });

    it('rejects when no payload is submitted but the signature requires one', async () => {
        mockSignature.findUnique.mockResolvedValue(baseSig);

        const result = await verifySignatureForEntity({
            signatureId: 'sig-1', userId: 'u1', entityType: 'SpoolInspection', entityId: 'insp-1',
        });

        expect(result.ok).toBe(false);
    });

    it('skips the payload check when the signature was created without one', async () => {
        mockSignature.findUnique.mockResolvedValue({ ...baseSig, payloadHash: null });

        const result = await verifySignatureForEntity({
            signatureId: 'sig-1', userId: 'u1', entityType: 'SpoolInspection', entityId: 'insp-1',
            // No payload supplied either — should not fail on content grounds.
        });

        expect(result.ok).toBe(true);
    });

    it('still rejects a signature belonging to a different user regardless of payload', async () => {
        mockSignature.findUnique.mockResolvedValue(baseSig);

        const result = await verifySignatureForEntity({
            signatureId: 'sig-1', userId: 'someone-else', entityType: 'SpoolInspection', entityId: 'insp-1',
            payload: { result: 'PASS', notes: null, clientApproved: false },
        });

        expect(result.ok).toBe(false);
    });

    it('still rejects a signature issued for a different entity regardless of payload', async () => {
        mockSignature.findUnique.mockResolvedValue(baseSig);

        const result = await verifySignatureForEntity({
            signatureId: 'sig-1', userId: 'u1', entityType: 'SpoolInspection', entityId: 'insp-DIFFERENT',
            payload: { result: 'PASS', notes: null, clientApproved: false },
        });

        expect(result.ok).toBe(false);
    });

    it('rejects an unknown signatureId', async () => {
        mockSignature.findUnique.mockResolvedValue(null);

        const result = await verifySignatureForEntity({
            signatureId: 'does-not-exist', userId: 'u1', entityType: 'SpoolInspection', entityId: 'insp-1',
        });

        expect(result.ok).toBe(false);
    });
});
