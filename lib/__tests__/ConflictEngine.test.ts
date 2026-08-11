/**
 * ConflictEngine.detectOverlapConflict.
 *
 * This app used to have two independent scheduling subsystems
 * (SchedulerService/ProductionSchedule, the one wired to the live UI/board,
 * and a separate SchedulingEngine/ScheduledJob table that had zero rows and
 * zero reachable callers). detectOverlapConflict briefly had to check both
 * tables to avoid double-booking across them; the second subsystem has since
 * been retired (its one real capability — batch scheduling — was folded into
 * SchedulerService.scheduleAll(), see scheduler.test.ts), so this only
 * checks ProductionSchedule again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProductionSchedule } = vi.hoisted(() => ({
    mockProductionSchedule: { findMany: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: { productionSchedule: mockProductionSchedule },
}));

import { ConflictEngine } from '@/lib/services/ConflictEngine';

beforeEach(() => {
    vi.clearAllMocks();
    mockProductionSchedule.findMany.mockResolvedValue([]);
});

describe('detectOverlapConflict', () => {
    it('returns false when there is no overlapping booking', async () => {
        const conflict = await ConflictEngine.detectOverlapConflict('m1', new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T10:00:00Z'));
        expect(conflict).toBe(false);
    });

    it('returns true when ProductionSchedule has an overlapping booking', async () => {
        mockProductionSchedule.findMany.mockResolvedValue([{ id: 'ps1' }]);
        const conflict = await ConflictEngine.detectOverlapConflict('m1', new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T10:00:00Z'));
        expect(conflict).toBe(true);
    });

    it('excludeScheduleId narrows the query to exclude that schedule', async () => {
        await ConflictEngine.detectOverlapConflict('m1', new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T10:00:00Z'), 'ps-exclude-me');

        expect(mockProductionSchedule.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: { not: 'ps-exclude-me' } }) }),
        );
    });

    it('queries only the requested machine and overlapping time window', async () => {
        const start = new Date('2026-01-01T08:00:00Z');
        const end = new Date('2026-01-01T10:00:00Z');
        await ConflictEngine.detectOverlapConflict('m1', start, end);

        expect(mockProductionSchedule.findMany).toHaveBeenCalledWith({
            where: {
                machineId: 'm1',
                status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
                plannedEnd: { gt: start },
                plannedStart: { lt: end },
            },
        });
    });
});
