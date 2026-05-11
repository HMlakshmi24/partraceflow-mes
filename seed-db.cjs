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

    const crypto = require('crypto');
    function hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');
        return `${salt}:${hash}`;
    }

    const defaultHash = hashPassword('demo');
    const adminHash = hashPassword('admin123');

    const users = {};
    for (const u of userDefs) {
        const pHash = u.role === 'ADMIN' ? adminHash : defaultHash;
        const user = await prisma.user.upsert({
            where: { username: u.username },
            update: {},
            create: { ...u, passwordHash: pHash, isActive: true, mustChangePassword: true },
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

        // Workflow instance + tasks
        const instance = await prisma.workflowInstance.create({
            data: { workOrderId: wo.id, status: 'ACTIVE' },
        });

        for (let i = 0; i < steps.length; i++) {
            const taskStatus = def.taskStatuses[i] ?? 'PENDING';
            await prisma.workflowTask.create({
                data: {
                    instanceId: instance.id,
                    stepDefId: steps[i].id,
                    status: taskStatus,
                    startTime: taskStatus !== 'PENDING' ? daysAgo(2) : null,
                    endTime: taskStatus === 'COMPLETED' ? daysAgo(1) : null,
                },
            });
        }

        console.log(`  ✅ Order ${def.orderNumber} (${def.status})`);
    }

    console.log('\n✅ Seeding complete! MES is ready.');
    console.log('\nLogin credentials (any password works for demo):');
    console.log('  admin       / admin123   → ADMIN');
    console.log('  Arjun.Supv  / demo       → SUPERVISOR');
    console.log('  Meena.Planner / demo     → PLANNER');
    console.log('  Raj.Op      / demo       → OPERATOR');
    console.log('  Deepa.QC    / demo       → QUALITY');
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
        console.error('❌ Seed error:', e.message);
        await prisma.$disconnect();
        process.exit(1);
    });
