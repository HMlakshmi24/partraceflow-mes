/**
 * revisionGuard — drawing-revision compliance gate.
 *
 * Untested before this: the control point that stops technicians from
 * welding/testing against a SUPERSEDED or not-yet-approved (IFR) isometric
 * drawing revision. A wrong branch here means non-compliant work silently
 * gets recorded as if the drawing were current.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSpool } = vi.hoisted(() => ({
    mockSpool: { findUnique: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: { pipeSpool: mockSpool },
}));

import { checkRevision, revisionError } from '@/lib/revisionGuard';

beforeEach(() => {
    vi.clearAllMocks();
});

function drawingSpool(status: string, drawingNumber = 'ISO-1001', revision = 'B') {
    return { spoolId: 'SP-1', drawing: { drawingNumber, revision, status } };
}

describe('checkRevision', () => {
    it('allows work with no linked drawing (not yet required)', async () => {
        mockSpool.findUnique.mockResolvedValue({ spoolId: 'SP-1', drawing: null });
        const result = await checkRevision('spool-1', 'WELD');
        expect(result.ok).toBe(true);
    });

    it('allows work with no drawing relation at all (findUnique returns null)', async () => {
        mockSpool.findUnique.mockResolvedValue(null);
        const result = await checkRevision('spool-1', 'WELD');
        expect(result.ok).toBe(true);
    });

    it('BLOCKS work on a SUPERSEDED drawing by default (no bypass)', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('SUPERSEDED'));
        const result = await checkRevision('spool-1', 'WELD');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.block).toBe(true);
            expect(result.reason).toContain('SUPERSEDED');
            expect(result.reason).not.toContain('Bypassed');
        }
    });

    it('converts SUPERSEDED block to a warning when bypass=true (supervisor override)', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('SUPERSEDED'));
        const result = await checkRevision('spool-1', 'WELD', true);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.block).toBe(false);
            expect(result.reason).toContain('Bypassed by supervisor');
        }
    });

    it('WARNS (does not block) on an IFR drawing, even without bypass', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('IFR'));
        const result = await checkRevision('spool-1', 'NDE');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.block).toBe(false);
            expect(result.reason).toContain('IFR');
            expect(result.reason).toContain('NDE');
        }
    });

    it('allows work on an IFC drawing', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('IFC'));
        const result = await checkRevision('spool-1', 'PRESSURE_TEST');
        expect(result.ok).toBe(true);
    });

    it('allows work on an AFC (Approved For Construction) drawing', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('AFC'));
        const result = await checkRevision('spool-1', 'INSPECTION');
        expect(result.ok).toBe(true);
    });

    it('surfaces the correct drawing number/revision in a block result', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('SUPERSEDED', 'ISO-9999', 'D'));
        const result = await checkRevision('spool-1', 'WELD');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.drawingNumber).toBe('ISO-9999');
            expect(result.revision).toBe('D');
            expect(result.drawingStatus).toBe('SUPERSEDED');
        }
    });
});

describe('revisionError — API-route helper', () => {
    it('returns null when the drawing is fine', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('AFC'));
        expect(await revisionError('spool-1', 'WELD')).toBeNull();
    });

    it('returns null for a warn-only IFR result (caller shows the warning but proceeds)', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('IFR'));
        expect(await revisionError('spool-1', 'WELD')).toBeNull();
    });

    it('returns a 422 with DRAWING_REVISION_BLOCKED for a SUPERSEDED drawing, no bypass', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('SUPERSEDED'));
        const err = await revisionError('spool-1', 'WELD');
        expect(err).not.toBeNull();
        expect(err?.status).toBe(422);
        expect((err?.body as any).code).toBe('DRAWING_REVISION_BLOCKED');
    });

    it('returns null for a SUPERSEDED drawing when bypass=true', async () => {
        mockSpool.findUnique.mockResolvedValue(drawingSpool('SUPERSEDED'));
        expect(await revisionError('spool-1', 'WELD', true)).toBeNull();
    });
});
