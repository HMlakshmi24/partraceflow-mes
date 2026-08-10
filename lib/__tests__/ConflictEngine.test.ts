/**
 * ConflictEngine.detectOverlapConflict — cross-scheduler double-booking fix.
 *
 * This app has two independent scheduling subsystems: SchedulerService
 * (ProductionSchedule table, the one wired to the live UI/board) and
 * SchedulingEngine (ScheduledJob table, reachable via POST
 * /api/schedule/optimize but not currently wired to any page). Before this
 * fix, detectOverlapConflict — the check the live scheduler uses to decide
 * whether a machine/time slot is free — only ever looked at
 * ProductionSchedule, so a machine already committed via the other engine's
 * ScheduledJob table could still pass this check as conflict-free and get
 * double-booked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProductionSchedule, mockScheduledJob } = vi.hoisted(() => ({
    mockProductionSchedule: { findMany: vi.fn() },
    mockScheduledJob: { findMany: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: { productionSchedule: mockProductionSchedule, scheduledJob: mockScheduledJob },
}));

import { ConflictEngine } from '@/lib/services/ConflictEngine';

beforeEach(() => {
    vi.clearAllMocks();
    mockProductionSchedule.findMany.mockResolvedValue([]);
    mockScheduledJob.findMany.mockResolvedValue([]);
});

describe('detectOverlapConflict', () => {
    it('returns false when neither table has an overlapping booking', async () => {
        const conflict = await ConflictEngine.detectOverlapConflict('m1', new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T10:00:00Z'));
        expect(conflict).toBe(false);
    });

    it('returns true when ProductionSchedule has an overlapping booking (existing behavior)', async () => {
        mockProductionSchedule.findMany.mockResolvedValue([{ id: 'ps1' }]);
        const conflict = await ConflictEngine.detectOverlapConflict('m1', new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T10:00:00Z'));
        expect(conflict).toBe(true);
    });

    it('returns true when ScheduledJob (the OTHER scheduler) has an overlapping booking — the bug fix', async () => {
        mockProductionSchedule.findMany.mockResolvedValue([]); // this engine sees nothing
        mockScheduledJob.findMany.mockResolvedValue([{ id: 'sj1' }]); // but the other engine already committed this slot
        const conflict = await ConflictEngine.detectOverlapConflict('m1', new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T10:00:00Z'));
        expect(conflict).toBe(true);
    });

    it('queries ScheduledJob with the same machine/time-window filter as ProductionSchedule', async () => {
        const start = new Date('2026-01-01T08:00:00Z');
        const end = new Date('2026-01-01T10:00:00Z');
        await ConflictEngine.detectOverlapConflict('m1', start, end);

        expect(mockScheduledJob.findMany).toHaveBeenCalledWith({
            where: {
                machineId: 'm1',
                status: { in: ['SCHEDULED', 'IN_PROGRESS', 'RESCHEDULED'] },
                scheduledEnd: { gt: start },
                scheduledStart: { lt: end },
            },
        });
    });

    it('excludeScheduleId only narrows the ProductionSchedule side (a ScheduledJob row has no such id to exclude)', async () => {
        await ConflictEngine.detectOverlapConflict('m1', new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T10:00:00Z'), 'ps-exclude-me');

        expect(mockProductionSchedule.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: { not: 'ps-exclude-me' } }) }),
        );
    });
});
