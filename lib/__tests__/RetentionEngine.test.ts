/**
 * RetentionEngine — HOT/WARM/COLD historian data aging.
 *
 * Covers a real data-loss bug found via audit: HistorianRecord.value can
 * hold non-numeric text (STATUS/ALARM signal types — see schema comment),
 * but HistorianService.aggregateRecords silently drops anything
 * parseFloat can't handle. The promotion logic used to treat "aggregation
 * returned nothing" as "nothing worth keeping" and deleted the source rows
 * anyway — permanently destroying status/alarm history the moment it aged
 * past the HOT window, including in the common case of a mixed bucket
 * (some numeric rows, some non-numeric rows for the same machine/signal/tag
 * in the same time window).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRecord } = vi.hoisted(() => ({
    mockRecord: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: { historianRecord: mockRecord },
}));

import { RetentionEngine, classifyAge, shouldPromoteToWarm, shouldPromoteToCold } from '@/lib/services/RetentionEngine';

beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.create.mockResolvedValue({});
    mockRecord.deleteMany.mockResolvedValue({ count: 0 });
    mockRecord.updateMany.mockResolvedValue({ count: 0 });
});

function record(overrides: Partial<{ id: string; value: string; signalType: string; timestamp: Date }> = {}) {
    return {
        id: overrides.id ?? 'r1',
        machineId: 'm1',
        signalType: overrides.signalType ?? 'TEMPERATURE',
        tagName: 'tag1',
        value: overrides.value ?? '42.5',
        quality: 'GOOD',
        timestamp: overrides.timestamp ?? new Date('2026-01-01T00:00:00Z'),
        source: 'MQTT',
        retentionClass: 'HOT',
    };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('classifyAge / shouldPromoteToWarm / shouldPromoteToCold', () => {
    it('classifies within HOT window as HOT', () => {
        expect(classifyAge(23 * 3_600_000)).toBe('HOT');
    });
    it('classifies just past HOT window as WARM', () => {
        expect(classifyAge(25 * 3_600_000)).toBe('WARM');
    });
    it('classifies past WARM window as COLD', () => {
        expect(classifyAge(31 * 86_400_000)).toBe('COLD');
    });
    it('shouldPromoteToWarm is false while still HOT', () => {
        const now = new Date('2026-01-01T10:00:00Z');
        expect(shouldPromoteToWarm(new Date('2026-01-01T00:00:00Z'), now)).toBe(false);
    });
    it('shouldPromoteToWarm is true once past HOT window', () => {
        const now = new Date('2026-01-02T02:00:00Z');
        expect(shouldPromoteToWarm(new Date('2026-01-01T00:00:00Z'), now)).toBe(true);
    });
});

// ── promoteHotToWarm: the data-loss regression ───────────────────────────────

describe('promoteHotToWarm — non-numeric (STATUS/ALARM) records are preserved, not destroyed', () => {
    it('a bucket of ONLY non-numeric records is promoted in place, never deleted', async () => {
        const rows = [
            record({ id: 's1', signalType: 'STATUS', value: 'RUNNING' }),
            record({ id: 's2', signalType: 'STATUS', value: 'IDLE' }),
        ];
        mockRecord.findMany.mockResolvedValue(rows);

        const count = await RetentionEngine.promoteHotToWarm();

        expect(mockRecord.deleteMany).not.toHaveBeenCalled();
        expect(mockRecord.create).not.toHaveBeenCalled();
        expect(mockRecord.updateMany).toHaveBeenCalledWith({
            where: { id: { in: expect.arrayContaining(['s1', 's2']) } },
            data: { retentionClass: 'WARM' },
        });
        expect(count).toBe(2);
    });

    it('a bucket of ONLY numeric records is aggregated and the originals deleted (existing correct behavior)', async () => {
        const rows = [
            record({ id: 't1', value: '10' }),
            record({ id: 't2', value: '20' }),
        ];
        mockRecord.findMany.mockResolvedValue(rows);

        const count = await RetentionEngine.promoteHotToWarm();

        expect(mockRecord.create).toHaveBeenCalledTimes(1);
        expect(mockRecord.create.mock.calls[0][0].data.value).toBe('15'); // avg(10,20)
        expect(mockRecord.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1', 't2'] } } });
        expect(mockRecord.updateMany).not.toHaveBeenCalled();
        expect(count).toBe(2);
    });

    it('a MIXED bucket (numeric + non-numeric for the same machine/signal/tag/hour) keeps both — regression for the original bug', async () => {
        // Same machineId/signalType/tagName/hour-bucket, one parseable, one not.
        const rows = [
            record({ id: 'm-num', signalType: 'ALARM', value: '1' }),
            record({ id: 'm-text', signalType: 'ALARM', value: 'E-STOP' }),
        ];
        mockRecord.findMany.mockResolvedValue(rows);

        const count = await RetentionEngine.promoteHotToWarm();

        // Numeric row aggregated + deleted...
        expect(mockRecord.create).toHaveBeenCalledTimes(1);
        expect(mockRecord.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['m-num'] } } });
        // ...non-numeric row preserved via in-place promotion, not silently dropped.
        expect(mockRecord.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['m-text'] } },
            data: { retentionClass: 'WARM' },
        });
        expect(count).toBe(2);
    });

    it('returns 0 and touches nothing when there are no eligible records', async () => {
        mockRecord.findMany.mockResolvedValue([]);
        const count = await RetentionEngine.promoteHotToWarm();
        expect(count).toBe(0);
        expect(mockRecord.create).not.toHaveBeenCalled();
        expect(mockRecord.deleteMany).not.toHaveBeenCalled();
        expect(mockRecord.updateMany).not.toHaveBeenCalled();
    });
});

describe('promoteWarmToCold — same non-numeric preservation fix applies', () => {
    it('promotes a non-numeric bucket to COLD in place instead of deleting it', async () => {
        const rows = [record({ id: 'c1', signalType: 'STATUS', value: 'DOWN' })];
        mockRecord.findMany.mockResolvedValue(rows);

        await RetentionEngine.promoteWarmToCold();

        expect(mockRecord.deleteMany).not.toHaveBeenCalled();
        expect(mockRecord.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['c1'] } },
            data: { retentionClass: 'COLD' },
        });
    });
});
