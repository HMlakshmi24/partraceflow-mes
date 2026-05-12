// @ts-check
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86_400_000);
const daysFromNow = (d) => new Date(now + d * 86_400_000);

async function main() {
    console.log('🌱 Seeding MES database...');

    // ── 1. Users ─────────────────────────────────────────────────────────────
    const userDefs = [
        { username: 'admin',         role: 'ADMIN',      employeeId: 'EMP-001' },
        { username: 'Arjun.Supv',    role: 'SUPERVISOR', employeeId: 'EMP-002' },
        { username: 'Meena.Planner', role: 'PLANNER',    employeeId: 'EMP-003' },
        { username: 'Raj.Op',        role: 'OPERATOR',   employeeId: 'EMP-004' },
        { username: 'Ramesh.Kumar',  role: 'OPERATOR',   employeeId: 'EMP-005' },
        { username: 'Priya.Nair',    role: 'OPERATOR',   employeeId: 'EMP-006' },
        { username: 'Deepa.QC',      role: 'QUALITY',    employeeId: 'EMP-007' },
        { username: 'operator',      role: 'OPERATOR',   employeeId: 'EMP-008' },
    ];

    const users = {};
    for (const u of userDefs) {
        const user = await prisma.user.upsert({
            where: { username: u.username },
            update: {},
            create: { ...u, passwordHash: null, isActive: true },
        });
        users[u.username] = user;
    }
    console.log('✅ Users:', Object.keys(users).length);

    // ── 2. Products ───────────────────────────────────────────────────────────
    const productDefs = [
        { sku: 'PMP-HG-101', name: 'Pump Housing Assembly',   description: 'Cast iron pump housing for industrial pumps' },
        { sku: 'VLV-BF-202', name: 'Ball Valve Assembly',     description: 'DN50 stainless steel ball valve' },
        { sku: 'PIP-SS-305', name: 'SS Pipe Spool 6"',        description: '316L stainless steel pipe spool' },
        { sku: 'PART-101',   name: 'Titanium Bracket',        description: 'Aerospace grade mounting bracket' },
        { sku: 'PART-202',   name: 'Steel Connector',         description: 'Industrial steel connector' },
    ];

    const products = {};
    for (const p of productDefs) {
        const prod = await prisma.product.upsert({
            where: { sku: p.sku },
            update: {},
            create: p,
        });
        products[p.sku] = prod;
    }
    console.log('✅ Products:', Object.keys(products).length);

    // ── 3. Machines ───────────────────────────────────────────────────────────
    const machineDefs = [
        { code: 'M-001', name: 'CNC Milling Center',   status: 'RUNNING', oee: 85.2 },
        { code: 'M-002', name: 'Assembly Station A',   status: 'IDLE',    oee: 92.1 },
        { code: 'M-003', name: 'Pressure Test Rig',    status: 'IDLE',    oee: 78.4 },
        { code: 'M-004', name: 'Inspection Station',   status: 'RUNNING', oee: 96.0 },
    ];
    for (const m of machineDefs) {
        await prisma.machine.upsert({ where: { code: m.code }, update: {}, create: m });
    }
    console.log('✅ Machines:', machineDefs.length);

    // ── 4. Andon Board ────────────────────────────────────────────────────────
    await prisma.andonBoard.upsert({
        where: { code: 'MAIN' },
        update: {},
        create: { code: 'MAIN', name: 'Main Factory Floor', location: 'Bay 1', isActive: true },
    });
    console.log('✅ Andon board');

    // ── 5. Workflow Step Definitions ──────────────────────────────────────────
    const stepDefs = [
        { name: 'Raw Material Inspection', sequence: 1 },
        { name: 'CNC Machining',           sequence: 2 },
        { name: 'Assembly',                sequence: 3 },
        { name: 'Pressure Test',           sequence: 4 },
        { name: 'Final QC Inspection',     sequence: 5 },
    ];
    const steps = [];
    for (const s of stepDefs) {
        let step = await prisma.workflowStepDef.findFirst({ where: { name: s.name } });
        if (!step) step = await prisma.workflowStepDef.create({ data: s });
        steps.push(step);
    }
    console.log('✅ Workflow steps:', steps.length);

    // ── 6. Demo Work Orders (all lifecycle states) ─────────────────────────────
    const orderDefs = [
        {
            orderNumber: 'WO-2026-001',
            status: 'PLANNED',
            quantity: 50,
            priority: 2,
            dueDate: daysFromNow(14),
            createdAt: daysAgo(3),
            productSku: 'PMP-HG-101',
            activities: [
                { action: 'CREATED', toStatus: 'PLANNED', performedBy: 'Meena.Planner', role: 'PLANNER', notes: 'Order created and queued for release', daysAgo: 3 },
            ],
            taskStatuses: ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
        },
        {
            orderNumber: 'WO-2026-002',
            status: 'RELEASED',
            quantity: 100,
            priority: 1,
            dueDate: daysFromNow(7),
            createdAt: daysAgo(5),
            productSku: 'VLV-BF-202',
            activities: [
                { action: 'CREATED',       toStatus: 'PLANNED',  performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 5 },
                { action: 'STATUS_CHANGE', fromStatus: 'PLANNED', toStatus: 'RELEASED', performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released to shop floor — materials confirmed available', daysAgo: 2 },
            ],
            taskStatuses: ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
        },
        {
            orderNumber: 'WO-2026-003',
            status: 'IN_PROGRESS',
            quantity: 75,
            priority: 1,
            dueDate: daysFromNow(3),
            createdAt: daysAgo(8),
            productSku: 'PIP-SS-305',
            activities: [
                { action: 'CREATED',       toStatus: 'PLANNED',     performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 8 },
                { action: 'STATUS_CHANGE', fromStatus: 'PLANNED',   toStatus: 'RELEASED',    performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released to production', daysAgo: 6 },
                { action: 'STATUS_CHANGE', fromStatus: 'RELEASED',  toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'Production started — Step 1 raw material inspection begun', daysAgo: 1 },
            ],
            taskStatuses: ['COMPLETED', 'IN_PROGRESS', 'PENDING', 'PENDING', 'PENDING'],
        },
        {
            orderNumber: 'WO-2026-004',
            status: 'QC_PENDING',
            quantity: 25,
            priority: 3,
            dueDate: daysFromNow(1),
            createdAt: daysAgo(12),
            productSku: 'PMP-HG-101',
            activities: [
                { action: 'CREATED',        toStatus: 'PLANNED',     performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 12 },
                { action: 'STATUS_CHANGE',  fromStatus: 'PLANNED',   toStatus: 'RELEASED',    performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released', daysAgo: 10 },
                { action: 'STATUS_CHANGE',  fromStatus: 'RELEASED',  toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'Production started', daysAgo: 9 },
                { action: 'TASK_COMPLETED',                          performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'All 5 workflow steps completed', daysAgo: 1 },
                { action: 'QC_RESULT',      fromStatus: 'IN_PROGRESS', toStatus: 'QC_PENDING', performedBy: 'system', role: 'SYSTEM', notes: 'All workflow tasks completed — routed to QC for inspection', daysAgo: 0 },
            ],
            taskStatuses: ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED'],
        },
        {
            orderNumber: 'WO-2026-005',
            status: 'REWORK',
            quantity: 60,
            priority: 2,
            dueDate: daysFromNow(5),
            createdAt: daysAgo(15),
            productSku: 'VLV-BF-202',
            activities: [
                { action: 'CREATED',        toStatus: 'PLANNED',     performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 15 },
                { action: 'STATUS_CHANGE',  fromStatus: 'PLANNED',   toStatus: 'RELEASED',    performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released', daysAgo: 13 },
                { action: 'STATUS_CHANGE',  fromStatus: 'RELEASED',  toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'Production started', daysAgo: 12 },
                { action: 'STATUS_CHANGE',  fromStatus: 'IN_PROGRESS', toStatus: 'QC_PENDING', performedBy: 'system', role: 'SYSTEM',     notes: 'Routed to QC', daysAgo: 3 },
                { action: 'QC_RESULT',      fromStatus: 'QC_PENDING', toStatus: 'REWORK',     performedBy: 'Deepa.QC', role: 'QUALITY',   notes: 'Surface finish defect on port face — dimensional tolerance exceeded by 0.3mm. Rework required.', daysAgo: 1 },
            ],
            taskStatuses: ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
        },
        {
            orderNumber: 'WO-2026-006',
            status: 'COMPLETED',
            quantity: 30,
            priority: 1,
            dueDate: daysAgo(2),
            createdAt: daysAgo(20),
            productSku: 'PIP-SS-305',
            activities: [
                { action: 'CREATED',        toStatus: 'PLANNED',     performedBy: 'Meena.Planner', role: 'PLANNER',    notes: 'Order created', daysAgo: 20 },
                { action: 'STATUS_CHANGE',  fromStatus: 'PLANNED',   toStatus: 'RELEASED',    performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Released to shop floor', daysAgo: 18 },
                { action: 'STATUS_CHANGE',  fromStatus: 'RELEASED',  toStatus: 'IN_PROGRESS', performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'Production commenced', daysAgo: 17 },
                { action: 'TASK_COMPLETED',                          performedBy: 'Raj.Op',     role: 'OPERATOR',   notes: 'All 5 workflow steps completed', daysAgo: 5 },
                { action: 'QC_RESULT',      fromStatus: 'IN_PROGRESS', toStatus: 'QC_PENDING', performedBy: 'system', role: 'SYSTEM',     notes: 'Routed to QC', daysAgo: 5 },
                { action: 'QC_RESULT',      fromStatus: 'QC_PENDING', toStatus: 'APPROVED',   performedBy: 'Deepa.QC', role: 'QUALITY',   notes: 'All dimensions within spec. Surface finish acceptable. QC PASS.', daysAgo: 4 },
                { action: 'STATUS_CHANGE',  fromStatus: 'APPROVED',  toStatus: 'COMPLETED',   performedBy: 'Arjun.Supv', role: 'SUPERVISOR', notes: 'Order signed off and marked complete', daysAgo: 2 },
            ],
            taskStatuses: ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED'],
        },
    ];

    // Operator assignment map per step — realistic shop floor assignment
    const operatorForStep = [
        users['Raj.Op'],        // Step 1: Raw Material Inspection
        users['Ramesh.Kumar'],  // Step 2: CNC Machining
        users['Priya.Nair'],    // Step 3: Assembly
        users['Raj.Op'],        // Step 4: Pressure Test
        users['Ramesh.Kumar'],  // Step 5: Final QC Inspection
    ];

    // Task-level QC parameters per step (industrial-realistic)
    const qcParamsForStep = [
        { parameter: 'Material Certificate',      expected: 'MTR verified, grade matches spec',  actual: 'MTR-2024-012 confirmed — CS A106 Gr.B',     result: 'PASS' },
        { parameter: 'Dimensional Tolerance',     expected: '±0.05 mm on all critical features', actual: '±0.03 mm — all features within tolerance',  result: 'PASS' },
        { parameter: 'Assembly Torque',           expected: '120 ± 10 Nm on body bolts',         actual: '118 Nm — within spec',                       result: 'PASS' },
        { parameter: 'Hydrostatic Pressure Test', expected: 'Hold 75 bar for 10 min, zero leaks', actual: '75 bar held 12 min — no leaks detected',    result: 'PASS' },
        { parameter: 'Surface Finish & Marking',  expected: 'Ra ≤ 3.2 µm, serial legible',       actual: 'Ra 1.8 µm, serial stamped correctly',        result: 'PASS' },
    ];

    for (const def of orderDefs) {
        const existing = await prisma.workOrder.findFirst({ where: { orderNumber: def.orderNumber } });
        if (existing) {
            console.log(`  ↩ Order ${def.orderNumber} already exists, skipping`);
            continue;
        }

        const product = products[def.productSku];
        const wo = await prisma.workOrder.create({
            data: {
                orderNumber: def.orderNumber,
                status: def.status,
                quantity: def.quantity,
                priority: def.priority,
                dueDate: def.dueDate,
                createdAt: def.createdAt,
                productId: product.id,
            },
        });

        // Activities
        for (const act of def.activities) {
            await prisma.orderActivity.create({
                data: {
                    orderId: wo.id,
                    action: act.action,
                    fromStatus: act.fromStatus ?? null,
                    toStatus: act.toStatus ?? null,
                    performedBy: act.performedBy,
                    role: act.role,
                    notes: act.notes,
                    timestamp: daysAgo(act.daysAgo),
                },
            });
        }

        // Workflow instance + tasks (with operators and realistic timestamps)
        const instance = await prisma.workflowInstance.create({
            data: { workOrderId: wo.id, status: 'ACTIVE' },
        });

        const createdTasks = [];
        for (let i = 0; i < steps.length; i++) {
            const taskStatus = def.taskStatuses[i] ?? 'PENDING';
            const op = operatorForStep[i];
            // Stagger start/end times realistically across the order duration
            const stepStartOffset = 2 + (steps.length - 1 - i) * 0.4;
            const stepEndOffset = 1 + (steps.length - 1 - i) * 0.35;
            const task = await prisma.workflowTask.create({
                data: {
                    instanceId: instance.id,
                    stepDefId: steps[i].id,
                    status: taskStatus,
                    operatorId: taskStatus !== 'PENDING' ? (op?.id ?? null) : null,
                    startTime: taskStatus !== 'PENDING' ? daysAgo(stepStartOffset) : null,
                    endTime: taskStatus === 'COMPLETED' ? daysAgo(stepEndOffset) : null,
                    reworkCount: def.status === 'REWORK' ? 1 : 0,
                },
            });
            createdTasks.push({ task, step: steps[i], index: i, taskStatus });
        }

        // ── QualityCheck records per completed task ────────────────────────────
        // For orders where tasks are COMPLETED, record per-step QC evidence.
        for (const { task, index, taskStatus } of createdTasks) {
            if (taskStatus !== 'COMPLETED') continue;
            const qcp = qcParamsForStep[index];
            await prisma.qualityCheck.create({
                data: {
                    taskId: task.id,
                    parameter: qcp.parameter,
                    expected: qcp.expected,
                    actual: qcp.actual,
                    result: qcp.result,
                },
            });
        }

        // ── InspectionRecord for orders that went through QC ──────────────────
        if (['QC_PENDING', 'REWORK', 'APPROVED', 'COMPLETED'].includes(def.status)) {
            const inspResult = def.status === 'REWORK' ? 'REWORK'
                : def.status === 'QC_PENDING' ? 'PASS'  // QC passed per task, order awaiting supervisor APPROVED
                : 'PASS';
            const inspNotes = def.status === 'REWORK'
                ? 'Surface finish defect on port face — dimensional tolerance exceeded by 0.3 mm on bore ID. Operator rework required before re-inspection.'
                : def.status === 'QC_PENDING'
                ? 'All 5 production steps passed in-process QC. Awaiting supervisor approval before dispatch.'
                : 'All dimensions within spec. Surface finish Ra 1.8 µm (limit 3.2). Pressure test held 12 min at 75 bar. QC PASS — approved for dispatch.';
            await prisma.inspectionRecord.create({
                data: {
                    workOrderId: wo.id,
                    inspector: 'Deepa.QC',
                    result: inspResult,
                    notes: inspNotes,
                    defectType: def.status === 'REWORK' ? 'Dimensional Out-of-Tolerance' : null,
                    measurements: JSON.stringify({
                        boreID:        { value: def.status === 'REWORK' ? 50.32 : 50.02, unit: 'mm',  limit: '50.00 ± 0.05', status: def.status === 'REWORK' ? 'FAIL' : 'PASS' },
                        flangeFaceRa:  { value: def.status === 'REWORK' ? 4.1   : 1.8,   unit: 'µm',  limit: '≤ 3.2',        status: def.status === 'REWORK' ? 'FAIL' : 'PASS' },
                        bodyBoltTorque:{ value: 118,                                     unit: 'Nm',  limit: '120 ± 10',     status: 'PASS' },
                        testPressure:  { value: 75,                                      unit: 'bar', limit: '75 min',        status: 'PASS' },
                        testDuration:  { value: def.status === 'REWORK' ? 12 : 12,      unit: 'min', limit: '10 min',        status: 'PASS' },
                    }),
                    visualChecks: JSON.stringify({
                        surfaceFinish: def.status === 'REWORK' ? 'FAIL — visible machining chatter marks on port face' : 'PASS — smooth finish, no chatter or burrs',
                        serialMarking: 'PASS — stamp legible and correctly positioned',
                        paintCoating:  'PASS — uniform coverage, no holidays or runs',
                        labelAlignment:'PASS — nameplate aligned and fully legible',
                    }),
                },
            });
        }

        // ── AuditDiff records for REWORK order — preserved operational evidence ─
        // Demonstrates immutable traceability: the audit trail shows that tasks WERE
        // completed (with timestamps and operators) before the QC failure reset them.
        if (def.status === 'REWORK') {
            const reworkTxId = `rework-${wo.id}-cycle1-seed`;
            const completedBeforeRework = createdTasks; // all tasks are now PENDING (post-rework)
            // The seed records what was recorded before rework: tasks had been completed
            const preReworkData = [
                { startOffset: 12.5, endOffset: 11.2, operatorIdx: 0 },
                { startOffset: 11.0, endOffset: 9.8,  operatorIdx: 1 },
                { startOffset: 9.5,  endOffset: 8.1,  operatorIdx: 2 },
                { startOffset: 8.0,  endOffset: 6.5,  operatorIdx: 3 },
                { startOffset: 6.2,  endOffset: 4.8,  operatorIdx: 4 },
            ];
            for (let i = 0; i < completedBeforeRework.length; i++) {
                const { task } = completedBeforeRework[i];
                const prev = preReworkData[i];
                const prevOp = operatorForStep[prev.operatorIdx];
                const evidenceFields = [
                    { fieldName: 'status',     oldValue: 'COMPLETED', newValue: 'PENDING' },
                    { fieldName: 'startTime',  oldValue: daysAgo(prev.startOffset).toISOString(), newValue: null },
                    { fieldName: 'endTime',    oldValue: daysAgo(prev.endOffset).toISOString(),   newValue: null },
                    { fieldName: 'operatorId', oldValue: prevOp?.id ?? null,                       newValue: null },
                ];
                for (const f of evidenceFields) {
                    await prisma.auditDiff.create({
                        data: {
                            entityType: 'WorkflowTask',
                            entityId: task.id,
                            fieldName: f.fieldName,
                            oldValue: f.oldValue,
                            newValue: f.newValue,
                            changedBy: 'Deepa.QC',
                            changedByRole: 'QUALITY',
                            changedByUserId: users['Deepa.QC']?.id ?? null,
                            transactionId: reworkTxId,
                            eventType: 'REWORK_RESET',
                            summary: `Rework cycle #1: evidence preserved before reset (step ${i + 1})`,
                        },
                    });
                }
            }
            // Also record what the failed QC inspection found
            await prisma.qualityCheck.create({
                data: {
                    taskId: completedBeforeRework[4].task.id, // Final QC step failure
                    parameter: 'Dimensional Tolerance — Bore ID',
                    expected: '50.00 ± 0.05 mm',
                    actual: '50.32 mm — exceeds tolerance by 0.27 mm',
                    result: 'FAIL',
                },
            });
        }

        console.log(`  ✅ Order ${def.orderNumber} (${def.status})`);
    }

    // ── InspectionRecord for COMPLETED order (WO-2026-006) already created above.
    // ── SystemEvents for key lifecycle moments ─────────────────────────────────
    console.log('  Seeding lifecycle system events...');
    const workOrders = await prisma.workOrder.findMany({
        where: { orderNumber: { in: ['WO-2026-004', 'WO-2026-005', 'WO-2026-006'] } },
        select: { id: true, orderNumber: true },
    });
    for (const wo of workOrders) {
        const existing = await prisma.systemEvent.findFirst({
            where: { eventType: 'WORKFLOW_SEED', details: { contains: wo.orderNumber } },
        });
        if (existing) continue;
        await prisma.systemEvent.create({
            data: {
                eventType: 'WORKFLOW_SEED',
                details: `Demo lifecycle event for ${wo.orderNumber} — seeded for industrial-ready demonstration`,
            },
        });
    }

    console.log('\n✅ Seeding complete! MES is ready.');
    console.log('\nLogin credentials (any password works for demo):');
    console.log('  admin         / admin123 → ADMIN');
    console.log('  Arjun.Supv    / demo     → SUPERVISOR');
    console.log('  Meena.Planner / demo     → PLANNER');
    console.log('  Raj.Op        / demo     → OPERATOR');
    console.log('  Deepa.QC      / demo     → QUALITY');
    console.log('\nDemo orders show the full MES lifecycle:');
    console.log('  WO-2026-001  PLANNED     → queued, awaiting release');
    console.log('  WO-2026-002  RELEASED    → on shop floor, tasks pending');
    console.log('  WO-2026-003  IN_PROGRESS → 1 step done, 4 remaining');
    console.log('  WO-2026-004  QC_PENDING  → all 5 steps done, awaiting supervisor approval');
    console.log('  WO-2026-005  REWORK      → QC failed, tasks reset (audit trail preserved)');
    console.log('  WO-2026-006  COMPLETED   → fully approved and dispatched');
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error('❌ Seed error:', e.message);
        await prisma.$disconnect();
        process.exit(1);
    });
