/**
 * OrderLifecycleService — the work-order state machine orchestrator (DB
 * side-effects layer around the pure, already-tested orderStateMachine.ts).
 * 616 lines, zero prior coverage. Focused on the two highest-risk paths:
 *
 *   1. transitionOrder's optimistic-concurrency guard (HIGH-2 fix) — must
 *      reject a status change if the order moved between the read and the
 *      write, instead of silently clobbering a concurrent change.
 *   2. onQualityInspection's REWORK path — must snapshot task evidence
 *      (startTime/endTime/operatorId) into immutable AuditDiff records
 *      BEFORE resetting those same fields to null, or the audit trail loses
 *      exactly the evidence a quality failure investigation would need.
 *
 * Uses real (unmocked) lib/orderStateMachine.ts — it's pure and already
 * tested elsewhere — with a mocked Prisma client and NotificationService.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockOrder, mockActivity, mockEvent, mockDiff, mockInstance, mockTask, mockAndonBoard, mockAndonEvent,
} = vi.hoisted(() => ({
    mockOrder: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    mockActivity: { create: vi.fn(), count: vi.fn() },
    mockEvent: { create: vi.fn() },
    mockDiff: { create: vi.fn() },
    mockInstance: { findMany: vi.fn() },
    mockTask: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    mockAndonBoard: { findFirst: vi.fn() },
    mockAndonEvent: { create: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: {
        workOrder: mockOrder,
        orderActivity: mockActivity,
        systemEvent: mockEvent,
        auditDiff: mockDiff,
        workflowInstance: mockInstance,
        workflowTask: mockTask,
        andonBoard: mockAndonBoard,
        andonEvent: mockAndonEvent,
        // Handles both call styles used across the service:
        //   prisma.$transaction([p1, p2])              (recordOrderNote)
        //   prisma.$transaction(async (tx) => {...})    (transitionOrder)
        // `tx` is given the same mocked collections as `prisma` itself.
        $transaction: vi.fn((arg: unknown) => {
            if (Array.isArray(arg)) return Promise.all(arg);
            const tx = {
                workOrder: mockOrder, orderActivity: mockActivity, systemEvent: mockEvent,
                auditDiff: mockDiff, workflowInstance: mockInstance, workflowTask: mockTask,
            };
            return (arg as (tx: unknown) => Promise<unknown>)(tx);
        }),
    },
}));

vi.mock('@/lib/services/NotificationService', () => ({
    NotificationService: { sendByEventType: vi.fn().mockResolvedValue(undefined) },
}));

import { OrderLifecycleService } from '@/lib/services/OrderLifecycleService';

beforeEach(() => {
    vi.clearAllMocks();
    mockActivity.create.mockResolvedValue({});
    mockEvent.create.mockResolvedValue({});
    mockDiff.create.mockResolvedValue({});
    mockAndonBoard.findFirst.mockResolvedValue(null);
});

function order(overrides: Partial<{ id: string; status: string; orderNumber: string }> = {}) {
    return { id: 'wo-1', status: overrides.status ?? 'QC_PENDING', orderNumber: overrides.orderNumber ?? 'WO-1001' };
}

// ── transitionOrder: optimistic concurrency guard ────────────────────────────

describe('transitionOrder — optimistic concurrency guard (HIGH-2)', () => {
    it('rejects the transition when the order status changed between read and write', async () => {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'QC_PENDING' }));
        // Simulates another writer having already moved it — the guarded
        // updateMany (WHERE id=? AND status=<status we validated against>)
        // matches zero rows.
        mockOrder.updateMany.mockResolvedValue({ count: 0 });

        await expect(
            OrderLifecycleService.transitionOrder({
                orderId: 'wo-1', newStatus: 'APPROVED', performedBy: 'sup1', role: 'SUPERVISOR',
            }),
        ).rejects.toThrow(/changed concurrently/i);
    });

    it('succeeds and applies the write when no concurrent change occurred', async () => {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'QC_PENDING' }));
        mockOrder.updateMany.mockResolvedValue({ count: 1 });
        mockOrder.findUniqueOrThrow.mockResolvedValue(order({ status: 'APPROVED' }));

        const result = await OrderLifecycleService.transitionOrder({
            orderId: 'wo-1', newStatus: 'APPROVED', performedBy: 'sup1', role: 'SUPERVISOR',
        });

        expect(result.status).toBe('APPROVED');
        expect(mockOrder.updateMany).toHaveBeenCalledWith({
            where: { id: 'wo-1', status: 'QC_PENDING' },
            data: { status: 'APPROVED' },
        });
    });

    it('rejects a transition the state machine does not allow', async () => {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'PLANNED' }));
        await expect(
            OrderLifecycleService.transitionOrder({
                orderId: 'wo-1', newStatus: 'COMPLETED', performedBy: 'sup1', role: 'ADMIN',
            }),
        ).rejects.toThrow(/Invalid workflow transition/i);
        expect(mockOrder.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a transition attempted by a role not authorized for that target status', async () => {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'QC_PENDING' }));
        await expect(
            OrderLifecycleService.transitionOrder({
                orderId: 'wo-1', newStatus: 'APPROVED', performedBy: 'op1', role: 'OPERATOR',
            }),
        ).rejects.toThrow(/cannot set order to/i);
        expect(mockOrder.updateMany).not.toHaveBeenCalled();
    });

    it('is a no-op (does not write) when already at the target status', async () => {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'APPROVED' }));
        const result = await OrderLifecycleService.transitionOrder({
            orderId: 'wo-1', newStatus: 'APPROVED', performedBy: 'sup1', role: 'SUPERVISOR',
        });
        expect(result.status).toBe('APPROVED');
        expect(mockOrder.updateMany).not.toHaveBeenCalled();
    });
});

// ── onQualityInspection: REWORK evidence-before-reset ordering ──────────────

describe('onQualityInspection — REWORK evidence preservation', () => {
    const completedTasks = [
        { id: 'task-1', startTime: new Date('2026-01-01T08:00:00Z'), endTime: new Date('2026-01-01T09:00:00Z'), operatorId: 'op-42' },
        { id: 'task-2', startTime: new Date('2026-01-01T09:00:00Z'), endTime: new Date('2026-01-01T10:00:00Z'), operatorId: 'op-43' },
    ];

    function setupRework() {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'QC_PENDING' }));
        mockOrder.updateMany.mockResolvedValue({ count: 1 });
        mockOrder.findUniqueOrThrow.mockResolvedValue(order({ status: 'REWORK' }));
        mockActivity.count.mockResolvedValue(0);
        mockInstance.findMany.mockResolvedValue([{ id: 'inst-1' }]);
        mockTask.findMany.mockResolvedValue(completedTasks);
        mockTask.updateMany.mockResolvedValue({ count: completedTasks.length });
    }

    it('records an AuditDiff snapshot for every evidence field of every reset task', async () => {
        setupRework();

        await OrderLifecycleService.onQualityInspection({
            workOrderId: 'wo-1', result: 'FAIL', performedBy: 'qc1', role: 'QUALITY', userId: 'u-qc1',
        });

        // 1 diff for the WorkOrder's own status change (inside transitionOrder's
        // transaction) + 2 tasks x 4 evidence fields (status, startTime,
        // endTime, operatorId) = 9 AuditDiff writes total.
        expect(mockDiff.create).toHaveBeenCalledTimes(9);
        const taskDiffs = mockDiff.create.mock.calls.filter(([arg]: any) => arg.data.entityType === 'WorkflowTask');
        expect(taskDiffs).toHaveLength(8);

        const task1StartDiff = taskDiffs.find(([arg]: any) => arg.data.entityId === 'task-1' && arg.data.fieldName === 'startTime')!;
        expect(task1StartDiff[0].data.oldValue).toBe(new Date('2026-01-01T08:00:00Z').toISOString());
        expect(task1StartDiff[0].data.newValue).toBeNull();

        const task2OperatorDiff = taskDiffs.find(([arg]: any) => arg.data.entityId === 'task-2' && arg.data.fieldName === 'operatorId')!;
        expect(task2OperatorDiff[0].data.oldValue).toBe('op-43');
    });

    it('preserves evidence in AuditDiff BEFORE the live task fields are cleared (ordering invariant)', async () => {
        setupRework();

        await OrderLifecycleService.onQualityInspection({
            workOrderId: 'wo-1', result: 'FAIL', performedBy: 'qc1', role: 'QUALITY',
        });

        const lastDiffCallOrder = Math.max(...mockDiff.create.mock.invocationCallOrder);
        const updateManyCallOrder = mockTask.updateMany.mock.invocationCallOrder[0];

        expect(lastDiffCallOrder).toBeLessThan(updateManyCallOrder);
    });

    it('actually clears the live task fields after snapshotting (status/time/operator reset to null/PENDING)', async () => {
        setupRework();

        await OrderLifecycleService.onQualityInspection({
            workOrderId: 'wo-1', result: 'FAIL', performedBy: 'qc1', role: 'QUALITY',
        });

        expect(mockTask.updateMany).toHaveBeenCalledWith({
            where: { instanceId: { in: ['inst-1'] }, status: 'COMPLETED' },
            data: { status: 'PENDING', startTime: null, endTime: null, operatorId: null, reworkCount: { increment: 1 } },
        });
    });

    it('returns REWORK and increments the rework cycle count across repeated failures', async () => {
        setupRework();
        mockActivity.count.mockResolvedValue(2); // this is the 3rd rework cycle

        const result = await OrderLifecycleService.onQualityInspection({
            workOrderId: 'wo-1', result: 'FAIL', performedBy: 'qc1', role: 'QUALITY',
        });

        expect(result).toBe('REWORK');
        const taskDiff = mockDiff.create.mock.calls.find(([arg]: any) => arg.data.entityType === 'WorkflowTask')!;
        expect(taskDiff[0].data.summary).toContain('cycle #3');
    });

    it('is safe with zero completed tasks — no per-task diffs, no crash, still resets cleanly', async () => {
        setupRework();
        mockTask.findMany.mockResolvedValue([]);

        await OrderLifecycleService.onQualityInspection({
            workOrderId: 'wo-1', result: 'FAIL', performedBy: 'qc1', role: 'QUALITY',
        });

        // Only the WorkOrder status-change diff from transitionOrder — no
        // WorkflowTask evidence diffs since there was nothing to reset.
        expect(mockDiff.create).toHaveBeenCalledTimes(1);
        expect(mockDiff.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: 'WorkOrder' }) }));
        expect(mockTask.updateMany).toHaveBeenCalled();
    });

    it('rejects recording QC on an order that is already COMPLETED or CANCELLED', async () => {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'COMPLETED' }));
        await expect(
            OrderLifecycleService.onQualityInspection({
                workOrderId: 'wo-1', result: 'FAIL', performedBy: 'qc1', role: 'QUALITY',
            }),
        ).rejects.toThrow(/already COMPLETED/i);
    });

    it('accepts "REWORK" as an alias result value, same as "FAIL"', async () => {
        setupRework();
        const result = await OrderLifecycleService.onQualityInspection({
            workOrderId: 'wo-1', result: 'rework', performedBy: 'qc1', role: 'QUALITY',
        });
        expect(result).toBe('REWORK');
    });

    // Regression test for a real bug found while writing this suite: a
    // task-level QC failure recorded while the order was RELEASED or
    // IN_PROGRESS (not yet at QC_PENDING) crashed with "Invalid workflow
    // transition" because VALID_TRANSITIONS only allowed REWORK from
    // QC_PENDING, even though onQualityInspection's own status guard
    // explicitly permits FAIL from these earlier statuses too. Fixed in
    // lib/orderStateMachine.ts.
    it.each(['RELEASED', 'IN_PROGRESS'])(
        'records a QC failure without crashing when the order is still %s (task-level QC, order not yet at QC_PENDING)',
        async (status) => {
            mockOrder.findUnique.mockResolvedValue(order({ status }));
            mockOrder.updateMany.mockResolvedValue({ count: 1 });
            mockOrder.findUniqueOrThrow.mockResolvedValue(order({ status: 'REWORK' }));
            mockActivity.count.mockResolvedValue(0);
            mockInstance.findMany.mockResolvedValue([]);
            mockTask.findMany.mockResolvedValue([]);
            mockTask.updateMany.mockResolvedValue({ count: 0 });

            const result = await OrderLifecycleService.onQualityInspection({
                workOrderId: 'wo-1', result: 'FAIL', performedBy: 'qc1', role: 'QUALITY',
            });

            expect(result).toBe('REWORK');
        },
    );
});

describe('onQualityInspection — PASS path guards', () => {
    it('rejects a PASS when the order is in a status QC pass cannot apply to', async () => {
        mockOrder.findUnique.mockResolvedValue(order({ status: 'PLANNED' }));
        await expect(
            OrderLifecycleService.onQualityInspection({
                workOrderId: 'wo-1', result: 'PASS', performedBy: 'qc1', role: 'QUALITY',
            }),
        ).rejects.toThrow(/Cannot record QC pass/i);
    });
});
