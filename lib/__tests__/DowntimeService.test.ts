/**
 * DowntimeService.getKPIs — window-clamping bug found via audit.
 *
 * Events are queried by startTime falling inside [fromDate, toDate], but
 * their full stored duration (computed from the event's real, unbounded
 * endTime) used to be summed regardless. An event that starts just before
 * toDate but runs long counted its entire duration even though most of it
 * falls outside the reporting window, which could push totalMinutes above
 * periodHours*60 and make availabilityPercent go negative.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEvent } = vi.hoisted(() => ({
    mockEvent: { findMany: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: { downtimeEvent: mockEvent },
}));

vi.mock('@/lib/services/RuntimeEngine', () => ({
    RuntimeEngine: { upsertHeartbeat: vi.fn().mockResolvedValue(undefined) },
}));

import { DowntimeService } from '@/lib/services/DowntimeService';

beforeEach(() => {
    vi.clearAllMocks();
});

function event(overrides: Partial<{
    startTime: Date; endTime: Date; durationMinutes: number;
    reason: { name: string; category: { type: string } } | null;
}> = {}) {
    return {
        id: 'e1',
        startTime: overrides.startTime ?? new Date('2026-01-01T00:00:00Z'),
        endTime: overrides.endTime ?? new Date('2026-01-01T01:00:00Z'),
        durationMinutes: overrides.durationMinutes ?? 60,
        reason: overrides.reason === undefined ? { name: 'Jam', category: { type: 'UNPLANNED' } } : overrides.reason,
    };
}

describe('getKPIs — window clamping', () => {
    it('an event fully inside the window counts its full duration (unchanged behavior)', async () => {
        const from = new Date('2026-01-01T00:00:00Z');
        const to = new Date('2026-01-01T08:00:00Z'); // 8h window
        mockEvent.findMany.mockResolvedValue([
            event({ startTime: new Date('2026-01-01T01:00:00Z'), endTime: new Date('2026-01-01T02:00:00Z'), durationMinutes: 60 }),
        ]);

        const kpis = await DowntimeService.getKPIs('m1', from, to);

        expect(kpis.totalDowntimeMinutes).toBe(60);
        expect(kpis.availabilityPercent).toBeGreaterThan(0);
    });

    it('an event that starts just before the window ends but runs long is clamped to the window, not counted in full', async () => {
        const from = new Date('2026-01-01T00:00:00Z');
        const to = new Date('2026-01-01T01:00:00Z'); // 1h window
        // Starts 10 minutes before window end, but the real outage lasts 5 days.
        mockEvent.findMany.mockResolvedValue([
            event({
                startTime: new Date('2026-01-01T00:50:00Z'),
                endTime: new Date('2026-01-06T00:50:00Z'),
                durationMinutes: 5 * 24 * 60,
            }),
        ]);

        const kpis = await DowntimeService.getKPIs('m1', from, to);

        // Only the 10 minutes that actually fall within [from, to] should count.
        expect(kpis.totalDowntimeMinutes).toBe(10);
    });

    it('availabilityPercent never goes negative even with a long-running event clamped at the window edge', async () => {
        const from = new Date('2026-01-01T00:00:00Z');
        const to = new Date('2026-01-01T01:00:00Z');
        mockEvent.findMany.mockResolvedValue([
            event({
                startTime: new Date('2026-01-01T00:00:00Z'),
                endTime: new Date('2026-01-10T00:00:00Z'),
                durationMinutes: 9 * 24 * 60,
            }),
        ]);

        const kpis = await DowntimeService.getKPIs('m1', from, to);

        expect(kpis.totalDowntimeMinutes).toBe(60); // clamped to the full 1h window
        expect(kpis.availabilityPercent).toBeGreaterThanOrEqual(0);
        expect(kpis.availabilityPercent).toBeCloseTo(0, 5);
    });

    it('MTTR still reflects the real (unclamped) repair duration, not the window-clamped one', async () => {
        const from = new Date('2026-01-01T00:00:00Z');
        const to = new Date('2026-01-01T01:00:00Z');
        mockEvent.findMany.mockResolvedValue([
            event({
                startTime: new Date('2026-01-01T00:50:00Z'),
                endTime: new Date('2026-01-06T00:50:00Z'),
                durationMinutes: 5 * 24 * 60,
            }),
        ]);

        const kpis = await DowntimeService.getKPIs('m1', from, to);

        expect(kpis.mttr).toBe(5 * 24 * 60);
    });
});
