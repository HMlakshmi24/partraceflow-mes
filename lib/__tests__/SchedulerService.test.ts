/**
 * SchedulerService.schedule() / scheduleAll() — the DB-touching methods that
 * were previously untested (only the pure formula helpers had coverage; see
 * CLAUDE.md's test-coverage gaps list).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWorkOrder, mockMachineCapability, mockProductionSchedule, mockProductionCalendar, mockSchedulingConflict } = vi.hoisted(() => ({
    mockWorkOrder: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    mockMachineCapability: { findMany: vi.fn() },
    mockProductionSchedule: { findMany: vi.fn(), create: vi.fn() },
    mockProductionCalendar: { findFirst: vi.fn() },
    mockSchedulingConflict: { create: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: {
        workOrder: mockWorkOrder,
        machineCapability: mockMachineCapability,
        productionSchedule: mockProductionSchedule,
        productionCalendar: mockProductionCalendar,
        schedulingConflict: mockSchedulingConflict,
        $transaction: vi.fn(async (arg: unknown) => {
            const tx = { productionSchedule: mockProductionSchedule, workOrder: mockWorkOrder };
            return (arg as (tx: unknown) => Promise<unknown>)(tx);
        }),
    },
}));

import { SchedulerService } from '@/lib/services/SchedulerService';

beforeEach(() => {
    vi.clearAllMocks();
    mockProductionCalendar.findFirst.mockResolvedValue(null);
    mockProductionSchedule.findMany.mockResolvedValue([]);
    mockProductionSchedule.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'ps-new', ...data }));
});

function workOrder(overrides: Partial<{ id: string; status: string; quantity: number; scheduledStart: Date | null; machineId: string | null }> = {}) {
    return {
        id: overrides.id ?? 'wo1',
        status: overrides.status ?? 'PLANNED',
        quantity: overrides.quantity ?? 100,
        scheduledStart: overrides.scheduledStart ?? null,
        machineId: overrides.machineId ?? null,
        product: { sku: 'SKU-1' },
    };
}

function capability(overrides: Partial<{ machineId: string; status: string; maxCapacityPerHour: number }> = {}) {
    return {
        machineId: overrides.machineId ?? 'm1',
        maxCapacityPerHour: overrides.maxCapacityPerHour ?? 100,
        machine: { id: overrides.machineId ?? 'm1', status: overrides.status ?? 'IDLE' },
    };
}

describe('SchedulerService.schedule', () => {
    it('happy path: creates a ProductionSchedule on the capable machine', async () => {
        mockWorkOrder.findUnique.mockResolvedValue(workOrder());
        mockMachineCapability.findMany.mockResolvedValue([capability({ machineId: 'm1', maxCapacityPerHour: 100 })]);

        const result = await SchedulerService.schedule('wo1');

        expect(result.success).toBe(true);
        expect(result.machineId).toBe('m1');
        expect(result.estimatedDurationMinutes).toBe(60); // 100 units / 100 per hr = 60 min
        expect(mockProductionSchedule.create).toHaveBeenCalledTimes(1);
    });

    it('returns an error when the work order does not exist', async () => {
        mockWorkOrder.findUnique.mockResolvedValue(null);
        const result = await SchedulerService.schedule('missing');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not found/);
    });

    it('refuses to schedule a COMPLETED work order', async () => {
        mockWorkOrder.findUnique.mockResolvedValue(workOrder({ status: 'COMPLETED' }));
        const result = await SchedulerService.schedule('wo1');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/COMPLETED/);
    });

    it('no capable machine → CAPABILITY_MISMATCH conflict persisted, scheduling fails', async () => {
        mockWorkOrder.findUnique.mockResolvedValue(workOrder());
        mockMachineCapability.findMany.mockResolvedValue([]);

        const result = await SchedulerService.schedule('wo1');

        expect(result.success).toBe(false);
        expect(result.conflicts[0].type).toBe('CAPABILITY_MISMATCH');
        expect(mockSchedulingConflict.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ conflictType: 'CAPABILITY_MISMATCH' }) }),
        );
    });

    it('all capable machines DOWN → MACHINE_DOWN conflict, scheduling fails', async () => {
        mockWorkOrder.findUnique.mockResolvedValue(workOrder());
        mockMachineCapability.findMany.mockResolvedValue([capability({ status: 'DOWN' })]);

        const result = await SchedulerService.schedule('wo1');

        expect(result.success).toBe(false);
        expect(result.conflicts[0].type).toBe('MACHINE_DOWN');
    });

    it('picks the first non-DOWN machine when multiple capabilities exist', async () => {
        mockWorkOrder.findUnique.mockResolvedValue(workOrder());
        mockMachineCapability.findMany.mockResolvedValue([
            capability({ machineId: 'm-down', status: 'DOWN' }),
            capability({ machineId: 'm-ok', status: 'IDLE' }),
        ]);

        const result = await SchedulerService.schedule('wo1');

        expect(result.success).toBe(true);
        expect(result.machineId).toBe('m-ok');
    });

    it('books the slot after existing bookings on the same machine', async () => {
        mockWorkOrder.findUnique.mockResolvedValue(workOrder());
        mockMachineCapability.findMany.mockResolvedValue([capability({ maxCapacityPerHour: 60 })]); // 100/60hr = 100min
        const from = new Date('2026-01-10T08:00:00Z');
        mockProductionSchedule.findMany.mockResolvedValue([
            { plannedStart: from, plannedEnd: new Date('2026-01-10T09:00:00Z') },
        ]);

        const result = await SchedulerService.schedule('wo1', undefined, from);

        expect(result.success).toBe(true);
        expect(result.plannedStart).toEqual(new Date('2026-01-10T09:00:00Z'));
    });
});

describe('SchedulerService.scheduleAll', () => {
    it('schedules every candidate work order in priority/due-date order (as requested from workOrder.findMany)', async () => {
        mockWorkOrder.findMany.mockResolvedValue([{ id: 'wo-a' }, { id: 'wo-b' }]);
        const scheduleSpy = vi.spyOn(SchedulerService, 'schedule').mockResolvedValue({
            success: true, scheduleId: 'ps1', conflicts: [],
        });

        const result = await SchedulerService.scheduleAll();

        expect(mockWorkOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }] }),
        );
        expect(scheduleSpy).toHaveBeenCalledTimes(2);
        expect(scheduleSpy).toHaveBeenNthCalledWith(1, 'wo-a');
        expect(scheduleSpy).toHaveBeenNthCalledWith(2, 'wo-b');
        expect(result.scheduled).toHaveLength(2);
        expect(result.unscheduled).toHaveLength(0);

        scheduleSpy.mockRestore();
    });

    it('collects failures into `unscheduled` instead of throwing', async () => {
        mockWorkOrder.findMany.mockResolvedValue([{ id: 'wo-a' }, { id: 'wo-b' }]);
        const scheduleSpy = vi.spyOn(SchedulerService, 'schedule')
            .mockResolvedValueOnce({ success: true, scheduleId: 'ps1', conflicts: [] })
            .mockResolvedValueOnce({ success: false, conflicts: [], error: 'No capable machine' });

        const result = await SchedulerService.scheduleAll();

        expect(result.scheduled).toHaveLength(1);
        expect(result.unscheduled).toEqual([{ workOrderId: 'wo-b', reason: 'No capable machine' }]);

        scheduleSpy.mockRestore();
    });

    it('an explicit workOrderIds list is used verbatim instead of the default PLANNED/RELEASED/unscheduled filter', async () => {
        mockWorkOrder.findMany.mockResolvedValue([{ id: 'wo-x' }]);
        const scheduleSpy = vi.spyOn(SchedulerService, 'schedule').mockResolvedValue({ success: true, conflicts: [] });

        await SchedulerService.scheduleAll(['wo-x']);

        expect(mockWorkOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: { in: ['wo-x'] } } }),
        );

        scheduleSpy.mockRestore();
    });
});
