/**
 * Static demo data served when the database is unavailable.
 * Covers all 5 test checks: workflow steps, activity tracking,
 * QC gates, stability, and integration readiness.
 */

const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * 86_400_000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const DEMO_PRODUCTS = [
    { id: 'demo-prod-1', sku: 'PMP-HG-101', name: 'Pump Housing Assembly',   description: 'Cast iron pump housing', createdAt: daysAgo(30), updatedAt: daysAgo(1) },
    { id: 'demo-prod-2', sku: 'VLV-BF-202', name: 'Ball Valve Assembly',      description: 'DN50 stainless ball valve', createdAt: daysAgo(30), updatedAt: daysAgo(1) },
    { id: 'demo-prod-3', sku: 'PIP-SS-305', name: 'SS Pipe Spool 6"',         description: '316L stainless spool', createdAt: daysAgo(30), updatedAt: daysAgo(1) },
];

// Workflow steps shared across orders
const STEPS = [
    { id: 'demo-step-1', name: 'Raw Material Inspection', sequence: 1 },
    { id: 'demo-step-2', name: 'CNC Machining',            sequence: 2 },
    { id: 'demo-step-3', name: 'Assembly',                 sequence: 3 },
    { id: 'demo-step-4', name: 'Pressure Test',            sequence: 4 },
    { id: 'demo-step-5', name: 'Final QC Inspection',      sequence: 5 },
];

function makeActivities(orderId: string, entries: { action: string; fromStatus?: string; toStatus?: string; performedBy: string; role: string; notes: string; daysAgo: number }[]) {
    return entries.map((e, i) => ({
        id: `act-${orderId}-${i}`,
        orderId,
        action: e.action,
        fromStatus: e.fromStatus ?? null,
        toStatus: e.toStatus ?? null,
        performedBy: e.performedBy,
        role: e.role,
        notes: e.notes,
        machine: null,
        operator: null,
        timestamp: new Date(now - e.daysAgo * 86_400_000).toISOString(),
    }));
}

function makeInstance(orderId: string, instanceId: string, tasks: { stepIdx: number; status: string; operatorName?: string }[]) {
    return {
        id: instanceId,
        workOrderId: orderId,
        status: 'ACTIVE',
        tasks: tasks.map(t => ({
            id: `task-${instanceId}-${t.stepIdx}`,
            instanceId,
            stepDefId: STEPS[t.stepIdx].id,
            status: t.status,
            startTime: t.status !== 'PENDING' ? daysAgo(2) : null,
            endTime: t.status === 'COMPLETED' ? daysAgo(1) : null,
            stepDef: STEPS[t.stepIdx],
            operator: t.operatorName ? { username: t.operatorName } : null,
            machine: null,
        })),
    };
}

// ── 6 Demo Orders covering every lifecycle state ──────────────────────────────

export const DEMO_ORDERS: any[] = [
    {
        id: 'demo-order-1',
        orderNumber: 'WO-2026-001',
        status: 'PLANNED',
        quantity: 50,
        priority: 2,
        dueDate: daysFromNow(14),
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
        productId: 'demo-prod-1',
        product: DEMO_PRODUCTS[0],
        activities: makeActivities('demo-order-1', [
            { action: 'CREATED', toStatus: 'PLANNED', performedBy: 'Meena.Planner', role: 'PLANNER', notes: 'Order WO-2026-001 created and queued for release', daysAgo: 3 },
        ]),
        workflowInstances: [makeInstance('demo-order-1', 'inst-1', [
            { stepIdx: 0, status: 'PENDING' },
            { stepIdx: 1, status: 'PENDING' },
            { stepIdx: 2, status: 'PENDING' },
            { stepIdx: 3, status: 'PENDING' },
            { stepIdx: 4, status: 'PENDING' },
        ])],
        nextActions: ['RELEASED', 'CANCELLED'],
        isDelayed: false,
    },
    {
        id: 'demo-order-2',
        orderNumber: 'WO-2026-002',
        status: 'RELEASED',
        quantity: 100,
        priority: 1,
        dueDate: daysFromNow(7),
        createdAt: daysAgo(5),
        updatedAt: daysAgo(2),
        productId: 'demo-prod-2',
        product: DEMO_PRODUCTS[1],
        activities: makeActivities('demo-order-2', [
            { action: 'CREATED',       toStatus: 'PLANNED',  performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 5 },
            { action: 'STATUS_CHANGE', fromStatus: 'PLANNED', toStatus: 'RELEASED', performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released to shop floor — materials confirmed available', daysAgo: 2 },
        ]),
        workflowInstances: [makeInstance('demo-order-2', 'inst-2', [
            { stepIdx: 0, status: 'PENDING' },
            { stepIdx: 1, status: 'PENDING' },
            { stepIdx: 2, status: 'PENDING' },
            { stepIdx: 3, status: 'PENDING' },
            { stepIdx: 4, status: 'PENDING' },
        ])],
        nextActions: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
        isDelayed: false,
    },
    {
        id: 'demo-order-3',
        orderNumber: 'WO-2026-003',
        status: 'IN_PROGRESS',
        quantity: 75,
        priority: 1,
        dueDate: daysFromNow(3),
        createdAt: daysAgo(8),
        updatedAt: daysAgo(1),
        productId: 'demo-prod-3',
        product: DEMO_PRODUCTS[2],
        activities: makeActivities('demo-order-3', [
            { action: 'CREATED',       toStatus: 'PLANNED',   performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 8 },
            { action: 'STATUS_CHANGE', fromStatus: 'PLANNED',  toStatus: 'RELEASED',    performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released to production', daysAgo: 6 },
            { action: 'STATUS_CHANGE', fromStatus: 'RELEASED', toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'Production started — Step 1 raw material inspection begun', daysAgo: 1 },
        ]),
        workflowInstances: [makeInstance('demo-order-3', 'inst-3', [
            { stepIdx: 0, status: 'COMPLETED',  operatorName: 'Raj.Op' },
            { stepIdx: 1, status: 'IN_PROGRESS', operatorName: 'Raj.Op' },
            { stepIdx: 2, status: 'PENDING' },
            { stepIdx: 3, status: 'PENDING' },
            { stepIdx: 4, status: 'PENDING' },
        ])],
        nextActions: ['ON_HOLD', 'CANCELLED'],
        isDelayed: false,
    },
    {
        id: 'demo-order-4',
        orderNumber: 'WO-2026-004',
        status: 'QC_PENDING',
        quantity: 25,
        priority: 3,
        dueDate: daysFromNow(1),
        createdAt: daysAgo(12),
        updatedAt: daysAgo(0),
        productId: 'demo-prod-1',
        product: DEMO_PRODUCTS[0],
        activities: makeActivities('demo-order-4', [
            { action: 'CREATED',       toStatus: 'PLANNED',     performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 12 },
            { action: 'STATUS_CHANGE', fromStatus: 'PLANNED',    toStatus: 'RELEASED',    performedBy: 'Arjun.Supv',  role: 'SUPERVISOR', notes: 'Released', daysAgo: 10 },
            { action: 'STATUS_CHANGE', fromStatus: 'RELEASED',   toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',      role: 'OPERATOR',   notes: 'Production started', daysAgo: 9 },
            { action: 'TASK_COMPLETED',                          performedBy: 'Raj.Op',      role: 'OPERATOR',   notes: 'All 5 workflow steps completed by Raj.Op', daysAgo: 1 },
            { action: 'QC_RESULT',     fromStatus: 'IN_PROGRESS', toStatus: 'QC_PENDING', performedBy: 'system',      role: 'SYSTEM',     notes: 'All workflow tasks completed — routed to QC for inspection', daysAgo: 0 },
        ]),
        workflowInstances: [makeInstance('demo-order-4', 'inst-4', [
            { stepIdx: 0, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 1, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 2, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 3, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 4, status: 'COMPLETED', operatorName: 'Raj.Op' },
        ])],
        nextActions: ['APPROVED', 'REWORK'],
        isDelayed: false,
    },
    {
        id: 'demo-order-5',
        orderNumber: 'WO-2026-005',
        status: 'REWORK',
        quantity: 60,
        priority: 2,
        dueDate: daysFromNow(5),
        createdAt: daysAgo(15),
        updatedAt: daysAgo(1),
        productId: 'demo-prod-2',
        product: DEMO_PRODUCTS[1],
        activities: makeActivities('demo-order-5', [
            { action: 'CREATED',       toStatus: 'PLANNED',     performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 15 },
            { action: 'STATUS_CHANGE', fromStatus: 'PLANNED',    toStatus: 'RELEASED',    performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released', daysAgo: 13 },
            { action: 'STATUS_CHANGE', fromStatus: 'RELEASED',   toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'Production started', daysAgo: 12 },
            { action: 'STATUS_CHANGE', fromStatus: 'IN_PROGRESS', toStatus: 'QC_PENDING', performedBy: 'system',     role: 'SYSTEM',     notes: 'Routed to QC', daysAgo: 3 },
            { action: 'QC_RESULT',     fromStatus: 'QC_PENDING', toStatus: 'REWORK',      performedBy: 'Deepa.QC',   role: 'QUALITY',    notes: 'Surface finish defect on port face — dimensional tolerance exceeded by 0.3mm. Rework required.', daysAgo: 1 },
        ]),
        workflowInstances: [makeInstance('demo-order-5', 'inst-5', [
            { stepIdx: 0, status: 'PENDING' },
            { stepIdx: 1, status: 'PENDING' },
            { stepIdx: 2, status: 'PENDING' },
            { stepIdx: 3, status: 'PENDING' },
            { stepIdx: 4, status: 'PENDING' },
        ])],
        nextActions: ['IN_PROGRESS', 'CANCELLED'],
        isDelayed: false,
    },
    {
        id: 'demo-order-6',
        orderNumber: 'WO-2026-006',
        status: 'COMPLETED',
        quantity: 30,
        priority: 1,
        dueDate: daysAgo(2),
        createdAt: daysAgo(20),
        updatedAt: daysAgo(2),
        productId: 'demo-prod-3',
        product: DEMO_PRODUCTS[2],
        activities: makeActivities('demo-order-6', [
            { action: 'CREATED',       toStatus: 'PLANNED',     performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 20 },
            { action: 'STATUS_CHANGE', fromStatus: 'PLANNED',    toStatus: 'RELEASED',    performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released to shop floor', daysAgo: 18 },
            { action: 'STATUS_CHANGE', fromStatus: 'RELEASED',   toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'Production commenced', daysAgo: 17 },
            { action: 'TASK_COMPLETED',                          performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'All 5 workflow steps completed', daysAgo: 5 },
            { action: 'QC_RESULT',     fromStatus: 'IN_PROGRESS', toStatus: 'QC_PENDING', performedBy: 'system',     role: 'SYSTEM',     notes: 'Routed to QC', daysAgo: 5 },
            { action: 'QC_RESULT',     fromStatus: 'QC_PENDING', toStatus: 'APPROVED',    performedBy: 'Deepa.QC',   role: 'QUALITY',    notes: 'All dimensions within spec. Surface finish acceptable. QC PASS.', daysAgo: 4 },
            { action: 'STATUS_CHANGE', fromStatus: 'APPROVED',   toStatus: 'COMPLETED',   performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Order signed off and marked complete', daysAgo: 2 },
        ]),
        workflowInstances: [makeInstance('demo-order-6', 'inst-6', [
            { stepIdx: 0, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 1, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 2, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 3, status: 'COMPLETED', operatorName: 'Raj.Op' },
            { stepIdx: 4, status: 'COMPLETED', operatorName: 'Raj.Op' },
        ])],
        nextActions: [],
        isDelayed: false,
    },
];
