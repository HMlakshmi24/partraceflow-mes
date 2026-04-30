import { prisma } from './database';
import { eventBus } from '@/lib/events/EventBus';
import { AndonService } from '@/lib/services/AndonService';
import { TraceabilityService } from '@/lib/services/TraceabilityService';
import { SPCService } from '@/lib/services/SPCService';
import { hashPassword } from '@/lib/auth';

// ─── Seed Data ──────────────────────────────────────────────────────────────

const MACHINES_SEED = [
    { code: 'CNC-01',  name: 'CNC Milling Center #1',     status: 'RUNNING'     },
    { code: 'CNC-02',  name: 'CNC Turning Center #2',     status: 'RUNNING'     },
    { code: 'WLD-01',  name: 'MIG Welding Robot',         status: 'IDLE'        },
    { code: 'QC-GATE', name: 'CMM Quality Gate',          status: 'RUNNING'     },
    { code: 'ASSY-01', name: 'Assembly Station — Line 3', status: 'RUNNING'     },
    { code: 'PKG-01',  name: 'Packaging & Labelling Unit',status: 'RUNNING'     },
];

const PRODUCTS_SEED = [
    { sku: 'PMP-HG-101', name: 'Pump Housing Assembly',       description: 'Centrifugal pump casing — SS304, Class 150' },
    { sku: 'VLV-WU-202', name: 'Valve Welding Unit',          description: 'Gate valve body — A105N, 600# flange' },
    { sku: 'FAB-L3-303', name: 'Line-3 Pipe Spool Fabrication', description: 'P&ID Line 3 spool set — CS, Sch 40, 6"' },
    { sku: 'BRK-STL-404', name: 'Structural Steel Bracket Kit', description: 'Structural bracket — IS 2062 Gr B, M16 pattern' },
];

// Passwords: admin → 'admin123', operators → 'demo'
const USERS_SEED = [
    { username: 'admin',          role: 'ADMIN',       password: 'admin123', displayName: 'Admin'           },
    { username: 'Ramesh.Kumar',   role: 'OPERATOR',    password: 'demo',     displayName: 'Ramesh Kumar'    },
    { username: 'Priya.Nair',     role: 'OPERATOR',    password: 'demo',     displayName: 'Priya Nair'      },
    { username: 'Ravi.Shankar',   role: 'OPERATOR',    password: 'demo',     displayName: 'Ravi Shankar'    },
    { username: 'Deepa.QC',       role: 'QUALITY',     password: 'demo',     displayName: 'Deepa (QC)'      },
    { username: 'Arjun.Supv',     role: 'SUPERVISOR',  password: 'demo',     displayName: 'Arjun (Supv)'    },
    { username: 'Meena.Planner',  role: 'PLANNER',     password: 'demo',     displayName: 'Meena (Planner)' },
];

// Full state machine journey per order — realistic industrial scenario
const WO_TEMPLATES = [
    { suffix: '1023', qty: 250, priority: 3, partIdx: 0, status: 'IN_PROGRESS',
      timeline: [
          { hoursAgo: 48, action: 'STATUS_CHANGE', from: 'PLANNED',     to: 'RELEASED',    by: 'Meena.Planner', role: 'PLANNER',    notes: 'Released to shop floor — Morning shift' },
          { hoursAgo: 44, action: 'STATUS_CHANGE', from: 'RELEASED',    to: 'IN_PROGRESS', by: 'Ramesh.Kumar',  role: 'OPERATOR',   notes: 'Started fabrication — CNC-01, Morning Shift', machine: 'CNC-01', operator: 'Ramesh Kumar' },
          { hoursAgo: 38, action: 'NOTE',           from: null,           to: null,          by: 'Ramesh.Kumar',  role: 'OPERATOR',   notes: '⚠ Minor delay — coolant refill, 25 min lost' },
      ]
    },
    { suffix: '1045', qty: 180, priority: 2, partIdx: 1, status: 'REWORK',
      timeline: [
          { hoursAgo: 72, action: 'STATUS_CHANGE', from: 'PLANNED',     to: 'RELEASED',    by: 'Meena.Planner', role: 'PLANNER',    notes: 'Urgent order — expedite flag set' },
          { hoursAgo: 68, action: 'STATUS_CHANGE', from: 'RELEASED',    to: 'IN_PROGRESS', by: 'Priya.Nair',    role: 'OPERATOR',   notes: 'Started on WLD-01, Afternoon Shift', machine: 'WLD-01', operator: 'Priya Nair' },
          { hoursAgo: 52, action: 'STATUS_CHANGE', from: 'IN_PROGRESS', to: 'QC_PENDING',  by: 'Priya.Nair',    role: 'OPERATOR',   notes: 'Sent to QC Gate after fabrication complete' },
          { hoursAgo: 48, action: 'QC_RESULT',      from: null,           to: null,          by: 'Deepa.QC',      role: 'QUALITY',    notes: '❌ QC FAILED — Weld defect detected on joint J-7. Root cause: porosity in weld bead.' },
          { hoursAgo: 46, action: 'STATUS_CHANGE', from: 'QC_PENDING',  to: 'REWORK',      by: 'Arjun.Supv',    role: 'SUPERVISOR', notes: 'Approved rework. Assigned back to WLD-01.' },
          { hoursAgo: 30, action: 'NOTE',           from: null,           to: null,          by: 'Ravi.Shankar',  role: 'OPERATOR',   notes: 'Rework in progress — re-welding joint J-7. Est. 4 hrs.' },
      ]
    },
    { suffix: '1067', qty: 320, priority: 1, partIdx: 2, status: 'QC_PENDING',
      timeline: [
          { hoursAgo: 36, action: 'STATUS_CHANGE', from: 'PLANNED',     to: 'RELEASED',    by: 'Meena.Planner', role: 'PLANNER',    notes: 'Priority 1 — Line-3 shutdown deadline' },
          { hoursAgo: 34, action: 'STATUS_CHANGE', from: 'RELEASED',    to: 'IN_PROGRESS', by: 'Ravi.Shankar',  role: 'OPERATOR',   notes: 'Fabrication started — ASSY-01, Night Shift', machine: 'ASSY-01', operator: 'Ravi Shankar' },
          { hoursAgo: 10, action: 'STATUS_CHANGE', from: 'IN_PROGRESS', to: 'QC_PENDING',  by: 'Ravi.Shankar',  role: 'OPERATOR',   notes: 'Fabrication complete. Handed off to QC Gate.' },
          { hoursAgo: 8,  action: 'NOTE',           from: null,           to: null,          by: 'Deepa.QC',      role: 'QUALITY',    notes: 'CMM inspection in progress — awaiting dimensional report.' },
      ]
    },
    { suffix: '1089', qty: 100, priority: 2, partIdx: 3, status: 'RELEASED',
      timeline: [
          { hoursAgo: 6, action: 'STATUS_CHANGE', from: 'PLANNED', to: 'RELEASED', by: 'Meena.Planner', role: 'PLANNER', notes: 'Released — CNC-02 cleared for this order from 14:00 shift' },
      ]
    },
    { suffix: '1012', qty: 400, priority: 2, partIdx: 0, status: 'COMPLETED',
      timeline: [
          { hoursAgo: 168, action: 'STATUS_CHANGE', from: 'PLANNED',     to: 'RELEASED',    by: 'Meena.Planner', role: 'PLANNER',    notes: 'Standard release' },
          { hoursAgo: 164, action: 'STATUS_CHANGE', from: 'RELEASED',    to: 'IN_PROGRESS', by: 'Ramesh.Kumar',  role: 'OPERATOR',   notes: 'Production started', machine: 'CNC-01', operator: 'Ramesh Kumar' },
          { hoursAgo: 140, action: 'STATUS_CHANGE', from: 'IN_PROGRESS', to: 'QC_PENDING',  by: 'Ramesh.Kumar',  role: 'OPERATOR',   notes: 'Fabrication done. Sent to QC.' },
          { hoursAgo: 136, action: 'QC_RESULT',      from: null,           to: null,          by: 'Deepa.QC',      role: 'QUALITY',    notes: '✅ QC PASSED — All dimensional checks within tolerance.' },
          { hoursAgo: 134, action: 'STATUS_CHANGE', from: 'QC_PENDING',  to: 'APPROVED',    by: 'Arjun.Supv',    role: 'SUPERVISOR', notes: 'Approved by supervisor for final delivery.' },
          { hoursAgo: 120, action: 'STATUS_CHANGE', from: 'APPROVED',    to: 'COMPLETED',   by: 'Arjun.Supv',    role: 'SUPERVISOR', notes: 'Order closed. 400 units shipped to warehouse.' },
      ]
    },
    { suffix: '1098', qty: 150, priority: 3, partIdx: 1, status: 'ON_HOLD',
      timeline: [
          { hoursAgo: 24, action: 'STATUS_CHANGE', from: 'PLANNED',     to: 'RELEASED',    by: 'Meena.Planner', role: 'PLANNER',    notes: 'Released for Morning shift' },
          { hoursAgo: 22, action: 'STATUS_CHANGE', from: 'RELEASED',    to: 'IN_PROGRESS', by: 'Priya.Nair',    role: 'OPERATOR',   notes: 'Started — WLD-01', machine: 'WLD-01', operator: 'Priya Nair' },
          { hoursAgo: 18, action: 'STATUS_CHANGE', from: 'IN_PROGRESS', to: 'ON_HOLD',     by: 'Arjun.Supv',    role: 'SUPERVISOR', notes: '⚠ HOLD — Material shortage. Awaiting SS304 pipe delivery from supplier.' },
      ]
    },
];

const DOWNTIME_CATS = [
    { code: 'MAINT',  name: 'Maintenance',          type: 'PLANNED',   reasons: ['Preventive Maintenance', 'Calibration'] },
    { code: 'BREAK',  name: 'Mechanical Breakdown',  type: 'UNPLANNED', reasons: ['Mechanical Breakdown', 'Electrical Fault', 'Tooling Failure'] },
    { code: 'SUPPLY', name: 'Supply Issues',         type: 'UNPLANNED', reasons: ['Material Shortage', 'Waiting for Fixtures'] },
    { code: 'OP',     name: 'Operator Related',      type: 'UNPLANNED', reasons: ['Setup / Changeover', 'Operator Break', 'Missing Instructions'] },
    { code: 'GENERAL',name: 'General',               type: 'UNPLANNED', reasons: ['Machine Breakdown', 'Quality Issue', 'Other'] },
];

const QC_PARAMS = [
    'Dimensional Error',
    'Surface Defect',
    'Bad Weld',
    'Discoloration',
    'Burrs',
    'Hole Misalignment',
    'Crack/Fracture',
];

// ─── Seed Function ───────────────────────────────────────────────────────────

export async function seedDemoData() {
    // 1. Downtime categories + reasons
    for (const cat of DOWNTIME_CATS) {
        const category = await prisma.downtimeCategory.upsert({
            where: { code: cat.code },
            create: { code: cat.code, name: cat.name, type: cat.type },
            update: {},
        });
        for (const reasonName of cat.reasons) {
            const rCode = `${cat.code}_${reasonName.replace(/\s+/g, '_').toUpperCase().slice(0, 20)}`;
            await prisma.downtimeReason.upsert({
                where: { code: rCode },
                create: { code: rCode, name: reasonName, categoryId: category.id },
                update: {},
            });
        }
    }

    // 2. Enterprise → Plant → Area → Line
    const enterprise = await prisma.enterprise.upsert({
        where: { code: 'ENT-001' },
        create: { code: 'ENT-001', name: 'ParTraceflow Manufacturing Corp', country: 'IN', timezone: 'Asia/Kolkata' },
        update: {},
    });

    const plant = await prisma.plant.upsert({
        where: { code: 'PLANT-BLR' },
        create: { code: 'PLANT-BLR', name: 'Bangalore Factory', location: 'Bangalore, Karnataka', enterpriseId: enterprise.id },
        update: {},
    });

    const area = await prisma.productionArea.upsert({
        where: { id: 'demo-area-001' },
        create: { id: 'demo-area-001', code: 'AREA-MAIN', name: 'Main Production Floor', plantId: plant.id },
        update: {},
    });

    const line = await prisma.productionLine.upsert({
        where: { id: 'demo-line-001' },
        create: { id: 'demo-line-001', code: 'LINE-A', name: 'Assembly Line A', areaId: area.id, targetCycleTime: 45 },
        update: {},
    });

    // 2b. Andon board + display (for live alerts on dashboard)
    const andonBoard = await prisma.andonBoard.upsert({
        where: { code: 'ANDON-01' },
        create: {
            code: 'ANDON-01',
            name: 'Main Floor Andon',
            location: 'Assembly Line A',
            plantId: plant.id,
            type: 'DIGITAL',
            isActive: true,
        },
        update: { isActive: true, plantId: plant.id },
    });

    await prisma.andonDisplay.upsert({
        where: { id: 'ANDON-01-DISPLAY' },
        create: {
            id: 'ANDON-01-DISPLAY',
            boardId: andonBoard.id,
            zone: 'LINE_A',
            currentColor: 'GREEN',
            message: null,
        },
        update: { boardId: andonBoard.id, zone: 'LINE_A' },
    });

    // 3. Machines
    const machines: Record<string, string> = {};
    for (const m of MACHINES_SEED) {
        const machine = await prisma.machine.upsert({
            where: { code: m.code },
            create: { code: m.code, name: m.name, status: m.status, oee: 75 + Math.random() * 20, productionLineId: line.id },
            update: { status: m.status, productionLineId: line.id },
        });
        machines[m.code] = machine.id;

        // Add signals for each machine
        const signalNames = [
            { name: 'spindle_speed',  type: 'ANALOG', unit: 'RPM',  proto: 'OPCUA', addr: `ns=2;s=${m.code}.SpindleSpeed`, min: 0, max: 12000 },
            { name: 'temperature',    type: 'ANALOG', unit: '°C',   proto: 'OPCUA', addr: `ns=2;s=${m.code}.Temperature`,  min: 20, max: 90  },
            { name: 'vibration',      type: 'ANALOG', unit: 'mm/s', proto: 'OPCUA', addr: `ns=2;s=${m.code}.Vibration`,    min: 0, max: 25   },
            { name: 'parts_counter',  type: 'ANALOG', unit: 'ea',   proto: 'MODBUS', addr: `40001`,                        min: 0, max: 99999 },
        ];
        for (const s of signalNames) {
            await prisma.machineSignal.upsert({
                where: { id: `sig-${m.code}-${s.name}` },
                create: { id: `sig-${m.code}-${s.name}`, machineId: machine.id, signalName: s.name, signalType: s.type, unit: s.unit, protocol: s.proto, address: s.addr, minValue: s.min, maxValue: s.max },
                update: {},
            });
        }
    }

    // 4. Products
    const products: string[] = [];
    for (const p of PRODUCTS_SEED) {
        const product = await prisma.product.upsert({
            where: { sku: p.sku },
            create: p,
            update: {},
        });
        products.push(product.id);
    }

    // 5. Users (with hashed passwords)
    for (const u of USERS_SEED) {
        const passwordHash = hashPassword(u.password);
        await prisma.user.upsert({
            where: { username: u.username },
            create: { username: u.username, role: u.role, plantId: plant.id, passwordHash, isActive: true },
            update: { passwordHash, role: u.role, isActive: true },
        });
    }

    // 6. Work Orders + Activity Timelines
    const year = new Date().getFullYear();
    for (const tmpl of WO_TEMPLATES) {
        const orderNumber = `WO-${year}-${tmpl.suffix}`;
        const dueOffset   = tmpl.priority === 3 ? 2 : tmpl.priority === 2 ? 5 : 10;
        const dueDate     = new Date(Date.now() + dueOffset * 86400000);

        let order = await prisma.workOrder.findUnique({ where: { orderNumber } });
        if (!order) {
            order = await prisma.workOrder.create({
                data: {
                    orderNumber,
                    quantity:  tmpl.qty,
                    priority:  tmpl.priority,
                    status:    tmpl.status,
                    dueDate,
                    productId: products[tmpl.partIdx],
                    createdAt: new Date(Date.now() - ((tmpl.timeline?.[0]?.hoursAgo ?? 0) + 1) * 3600000),
                },
            });
        }

        // Seed activity timeline for this order
        if (tmpl.timeline) {
            const existingActivities = await prisma.orderActivity.count({ where: { orderId: order.id } });
            if (existingActivities === 0) {
                for (const ev of tmpl.timeline) {
                    await prisma.orderActivity.create({
                        data: {
                            orderId:     order.id,
                            action:      ev.action,
                            fromStatus:  ev.from  ?? null,
                            toStatus:    ev.to    ?? null,
                            performedBy: ev.by,
                            role:        ev.role,
                            machine:     (ev as any).machine  ?? null,
                            operator:    (ev as any).operator ?? null,
                            notes:       ev.notes ?? null,
                            timestamp:   new Date(Date.now() - ev.hoursAgo * 3600000),
                        },
                    });
                }
            }
        }
    }

    // 6b. Workflow Step Definitions (ensure tasks can be created)
    const stepDefs = [
        { name: 'Prepare Material', sequence: 1 },
        { name: 'CNC Machining', sequence: 2 },
        { name: 'Quality Inspection', sequence: 3 },
        { name: 'Final Assembly', sequence: 4 },
    ];
    for (const step of stepDefs) {
        const existing = await prisma.workflowStepDef.findFirst({ where: { name: step.name } });
        if (!existing) {
            await prisma.workflowStepDef.create({ data: step });
        }
    }

    // 6c. Demo workflow instance + tasks (to drive production + scrap)
    const firstOrder = await prisma.workOrder.findFirst({ orderBy: { createdAt: 'desc' } });
    if (firstOrder) {
        const existingInstance = await prisma.workflowInstance.findFirst({
            where: { workOrderId: firstOrder.id },
        });
        if (!existingInstance) {
            const instance = await prisma.workflowInstance.create({
                data: { workOrderId: firstOrder.id, status: 'ACTIVE' },
            });

            const steps = await prisma.workflowStepDef.findMany({ orderBy: { sequence: 'asc' } });
            const machine = await prisma.machine.findFirst();
            const operator = await prisma.user.findFirst({ where: { role: 'OPERATOR' } });
            const now = new Date();

            for (let i = 0; i < steps.length; i++) {
                const status = i < 2 ? 'COMPLETED' : i === 2 ? 'IN_PROGRESS' : 'PENDING';
                const startTime = i < 2 ? new Date(now.getTime() - (120 - i * 30) * 60000) : i === 2 ? new Date(now.getTime() - 20 * 60000) : null;
                const endTime = i < 2 ? new Date(now.getTime() - (90 - i * 20) * 60000) : null;
                await prisma.workflowTask.create({
                    data: {
                        instanceId: instance.id,
                        stepDefId: steps[i].id,
                        status,
                        machineId: machine?.id,
                        operatorId: operator?.id,
                        startTime: startTime ?? undefined,
                        endTime: endTime ?? undefined,
                    },
                });
            }

            const completedTask = await prisma.workflowTask.findFirst({
                where: { instanceId: instance.id, status: 'COMPLETED' },
                orderBy: { endTime: 'desc' },
            });
            if (completedTask) {
                const qcCount = 6;
                for (let i = 0; i < qcCount; i++) {
                    const param = QC_PARAMS[i % QC_PARAMS.length];
                    const isFail = i % 4 === 0;
                    await prisma.qualityCheck.create({
                        data: {
                            taskId: completedTask.id,
                            parameter: param,
                            expected: 'OK',
                            actual: isFail ? 'FAIL' : 'OK',
                            result: isFail ? 'FAIL' : 'PASS',
                        },
                    });
                }
            }
        }
    }

    // 6d. Demo traceability chain (Lot -> Batch -> Serial -> QC -> Shipment)
    if (firstOrder) {
        const lotNumber = 'LOT-RAW-A01';
        let lot = await prisma.lot.findUnique({ where: { lotNumber } });
        if (!lot) {
            lot = await TraceabilityService.createLot({
                lotNumber,
                productId: products[0],
                quantity: 1500,
                unit: 'EA',
                supplierId: 'SUP-001',
                certificateOfConformance: 'COC-2026-AL-9931',
            });
        }

        const batchNumber = `BATCH-${new Date().getFullYear()}-A01`;
        let batch = await prisma.batch.findUnique({ where: { batchNumber } });
        if (!batch) {
            batch = await TraceabilityService.createBatch({
                batchNumber,
                workOrderId: firstOrder.id,
                lotId: lot.id,
                quantity: 250,
            });
        }

        const serials = ['SN-DEMO-001', 'SN-DEMO-002', 'SN-DEMO-003'];
        for (const sn of serials) {
            const existing = await prisma.serialNumber.findUnique({ where: { serial: sn } });
            if (!existing) {
                await TraceabilityService.assignSerial({
                    serial: sn,
                    batchId: batch.id,
                    productId: products[0],
                });
            }
        }

        const machine = await prisma.machine.findFirst();
        const operator = await prisma.user.findFirst({ where: { role: 'OPERATOR' } });
        const task = await prisma.workflowTask.findFirst({ orderBy: { endTime: 'desc' } });

        const usageExists = await prisma.materialUsage.findFirst({
            where: { batchId: batch.id, lotId: lot.id },
        });
        if (!usageExists) {
            await TraceabilityService.recordMaterialUsage({
                batchId: batch.id,
                lotId: lot.id,
                quantity: 220,
                unit: 'EA',
                taskId: task?.id,
                operatorId: operator?.id,
            });
        }

        const existingTrace = await prisma.traceabilityRecord.findFirst({
            where: { batchId: batch.id },
        });
        if (!existingTrace) {
            await TraceabilityService.recordEvent({
                batchId: batch.id,
                eventType: 'PRODUCTION_START',
                machineId: machine?.id,
                operatorId: operator?.id,
                taskId: task?.id,
                data: { shift: 'A', line: 'LINE-A' },
            });
            await TraceabilityService.recordEvent({
                batchId: batch.id,
                eventType: 'MACHINE_START',
                machineId: machine?.id,
                operatorId: operator?.id,
                taskId: task?.id,
                data: { rpm: 6200, tempC: 58.4 },
            });
            await TraceabilityService.recordEvent({
                batchId: batch.id,
                eventType: 'TASK_COMPLETE',
                machineId: machine?.id,
                operatorId: operator?.id,
                taskId: task?.id,
                data: { step: 'CNC Machining', durationMin: 28 },
            });
            await TraceabilityService.recordEvent({
                batchId: batch.id,
                eventType: 'QUALITY_PASS',
                machineId: machine?.id,
                operatorId: operator?.id,
                taskId: task?.id,
                data: { inspector: operator?.username ?? 'OP-JOHN', result: 'PASS' },
            });
        }
    }

    // 6e. Seed SPC demo parameters + records (so SPC page is immediately useful)
    const spcMachines = await prisma.machine.findMany({ take: 2 });
    if (spcMachines.length > 0) {
        const DEMO_PARAMS = [
            { name: 'Spindle Speed', unit: 'RPM', nominal: 3000, usl: 3300, lsl: 2700, sigma: 80 },
            { name: 'Feed Rate', unit: 'mm/min', nominal: 150, usl: 165, lsl: 135, sigma: 5 },
            { name: 'Surface Roughness', unit: 'Ra um', nominal: 1.6, usl: 2.0, lsl: 1.2, sigma: 0.1 },
        ];

        for (let pi = 0; pi < DEMO_PARAMS.length; pi++) {
            const dp = DEMO_PARAMS[pi];
            const machine = spcMachines[pi % spcMachines.length];

            let param = await prisma.processParameter.findFirst({
                where: { parameterName: dp.name, machineId: machine.id }
            });
            if (!param) {
                param = await prisma.processParameter.create({
                    data: {
                        parameterName: dp.name,
                        unit: dp.unit,
                        machineId: machine.id,
                        nominalValue: dp.nominal,
                        upperSpecLimit: dp.usl,
                        lowerSpecLimit: dp.lsl
                    }
                });
            }

            const existingCount = await prisma.sPCRecord.count({ where: { parameterId: param.id } });
            if (existingCount < 10) {
                const records = [];
                for (let i = 59; i >= 0; i--) {
                    const t = new Date(Date.now() - i * 72 * 60 * 1000);
                    const drift = i < 10 ? dp.sigma * 1.5 : 0;
                    const value = dp.nominal + drift + (Math.random() - 0.5) * dp.sigma * 2;
                    records.push({
                        parameterId: param.id,
                        value: parseFloat(value.toFixed(3)),
                        machineId: machine.id,
                        measuredAt: t,
                        inControl: true,
                        violationType: null
                    });
                }
                for (const r of records) { try { await prisma.sPCRecord.create({ data: r }); } catch (_) {} }
                await SPCService.recalculateControlLimits(param.id, 50);
            }
        }
    }

    // 6f. Seed a few downtime events across categories (for pareto variety)
    const reasons = await prisma.downtimeReason.findMany({ take: 8 });
    const machinesList = await prisma.machine.findMany();
    if (reasons.length > 0 && machinesList.length > 0) {
        const now = new Date();
        for (let i = 0; i < Math.min(5, reasons.length); i++) {
            const m = machinesList[i % machinesList.length];
            const start = new Date(now.getTime() - (120 + i * 25) * 60000);
            const end = new Date(start.getTime() + (10 + i * 6) * 60000);
            await prisma.downtimeEvent.create({
                data: {
                    machineId: m.id,
                    reasonId: reasons[i].id,
                    startTime: start,
                    endTime: end,
                    durationMinutes: (end.getTime() - start.getTime()) / 60000,
                    status: 'CLOSED',
                },
            });
        }
    }

    // 7. Historical downtime events (last 24h) — drives Downtime Pareto
    const allMachineIds = Object.values(machines);
    const allReasons = await prisma.downtimeReason.findMany();
    const DOWNTIME_HISTORY = [
        { reasonName: 'Mechanical Breakdown',  minutes: 47, hoursAgo: 2  },
        { reasonName: 'Tooling Failure',        minutes: 22, hoursAgo: 5  },
        { reasonName: 'Material Shortage',      minutes: 35, hoursAgo: 8  },
        { reasonName: 'Setup / Changeover',     minutes: 18, hoursAgo: 10 },
        { reasonName: 'Electrical Fault',       minutes: 62, hoursAgo: 14 },
        { reasonName: 'Preventive Maintenance', minutes: 90, hoursAgo: 18 },
        { reasonName: 'Waiting for Fixtures',   minutes: 15, hoursAgo: 20 },
        { reasonName: 'Operator Break',         minutes: 12, hoursAgo: 22 },
        { reasonName: 'Calibration',            minutes: 30, hoursAgo: 3  },
        { reasonName: 'Quality Issue',          minutes: 25, hoursAgo: 6  },
    ];
    for (let i = 0; i < DOWNTIME_HISTORY.length; i++) {
        const item = DOWNTIME_HISTORY[i];
        const reason = allReasons.find(r => r.name === item.reasonName);
        if (!reason) continue;
        const startTime = new Date(Date.now() - item.hoursAgo * 3600 * 1000);
        const endTime = new Date(startTime.getTime() + item.minutes * 60 * 1000);
        const machineId = allMachineIds[i % allMachineIds.length];
        const existing = await prisma.downtimeEvent.findFirst({ where: { machineId, reasonId: reason.id, startTime } });
        if (!existing) {
            await prisma.downtimeEvent.create({
                data: { machineId, reasonId: reason.id, startTime, endTime, durationMinutes: item.minutes, status: 'CLOSED' }
            });
        }
    }

    // 8. Historical quality fails — drives Scrap Pareto
    const QC_FAILS = [
        { parameter: 'Surface Finish',   count: 8 },
        { parameter: 'Dimensional OOS',  count: 5 },
        { parameter: 'Wrong Color',      count: 3 },
        { parameter: 'Label Misaligned', count: 6 },
        { parameter: 'Assembly Error',   count: 4 },
        { parameter: 'Torque Failure',   count: 2 },
    ];
    // Find or create a dummy task to attach QC records to
    let dummyTask = await prisma.workflowTask.findFirst();
    if (!dummyTask) {
        const anyMachine = await prisma.machine.findFirst();
        const anyInstance = await prisma.workflowInstance.findFirst();
        let stepDef = await prisma.workflowStepDef.findFirst();
        if (!stepDef) {
            stepDef = await prisma.workflowStepDef.create({ data: { name: 'Final Inspection', sequence: 1 } });
        }
        if (anyMachine && anyInstance && stepDef) {
            dummyTask = await prisma.workflowTask.create({
                data: { machineId: anyMachine.id, instanceId: anyInstance.id, stepDefId: stepDef.id, status: 'COMPLETED', startTime: new Date(), endTime: new Date() }
            });
        }
    }
    if (dummyTask) {
        for (const fail of QC_FAILS) {
            const existing = await prisma.qualityCheck.count({ where: { parameter: fail.parameter, result: 'FAIL' } });
            const toCreate = fail.count - existing;
            for (let i = 0; i < toCreate; i++) {
                await prisma.qualityCheck.create({
                    data: { taskId: dummyTask.id, parameter: fail.parameter, result: 'FAIL', expected: 'within-spec', actual: 'out-of-spec' }
                });
            }
        }
    }

    // 8b. Seed Shift templates + schedules (Shift Management page)
    const SHIFT_TEMPLATES = [
        { code: 'SHIFT-A', name: 'Morning Shift',   startTime: '06:00', endTime: '14:00', durationHours: 8 },
        { code: 'SHIFT-B', name: 'Afternoon Shift', startTime: '14:00', endTime: '22:00', durationHours: 8 },
        { code: 'SHIFT-C', name: 'Night Shift',     startTime: '22:00', endTime: '06:00', durationHours: 8 },
    ];

    const shiftIds: string[] = [];
    for (const st of SHIFT_TEMPLATES) {
        const existing = await prisma.shift.findFirst({ where: { code: st.code } });
        if (existing) { shiftIds.push(existing.id); continue; }
        const shift = await prisma.shift.create({
            data: { code: st.code, name: st.name, startTime: st.startTime, endTime: st.endTime, durationHours: st.durationHours, plantId: plant.id }
        });
        shiftIds.push(shift.id);
    }

    // Create schedules for today and yesterday
    const operators = await prisma.user.findMany({ where: { role: 'OPERATOR' }, take: 3 });
    const supervisor = await prisma.user.findFirst({ where: { role: 'SUPERVISOR' } });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);

    const SCHEDULE_TEMPLATES = [
        { dateOffset: yesterday, shiftIdx: 0, status: 'COMPLETED', actual: 198, good: 192, scrap: 6, planned: 15, unplanned: 22, oee: 0.82 },
        { dateOffset: yesterday, shiftIdx: 1, status: 'COMPLETED', actual: 215, good: 210, scrap: 5, planned: 0,  unplanned: 18, oee: 0.87 },
        { dateOffset: yesterday, shiftIdx: 2, status: 'COMPLETED', actual: 176, good: 170, scrap: 6, planned: 30, unplanned: 35, oee: 0.73 },
        { dateOffset: today,     shiftIdx: 0, status: 'COMPLETED', actual: 142, good: 138, scrap: 4, planned: 0,  unplanned: 12, oee: 0.85 },
        { dateOffset: today,     shiftIdx: 1, status: 'ACTIVE',    actual: 87,  good: 84,  scrap: 3, planned: 0,  unplanned: 8,  oee: 0.83 },
    ];

    for (const tmpl of SCHEDULE_TEMPLATES) {
        const existing = await prisma.shiftSchedule.findFirst({
            where: { shiftId: shiftIds[tmpl.shiftIdx], date: tmpl.dateOffset, productionLineId: line.id }
        });
        if (existing) continue;

        const schedule = await prisma.shiftSchedule.create({
            data: {
                shiftId: shiftIds[tmpl.shiftIdx],
                productionLineId: line.id,
                date: tmpl.dateOffset,
                targetQuantity: 200,
                status: tmpl.status,
            }
        });

        await prisma.shiftProduction.create({
            data: {
                scheduleId: schedule.id,
                actualQuantity: tmpl.actual,
                goodQuantity: tmpl.good,
                scrapQuantity: tmpl.scrap,
                plannedDowntime: tmpl.planned,
                unplannedDowntime: tmpl.unplanned,
                oee: tmpl.oee,
                availability: tmpl.oee + 0.05,
                performance: tmpl.oee + 0.03,
                quality: tmpl.good / tmpl.actual,
            }
        });

        // Assign operators to the schedule
        for (let i = 0; i < Math.min(operators.length, 2); i++) {
            const clockIn = new Date(tmpl.dateOffset.getTime() + parseInt(SHIFT_TEMPLATES[tmpl.shiftIdx].startTime.split(':')[0]) * 3600000);
            await prisma.operatorShift.create({
                data: {
                    userId: operators[i].id,
                    scheduleId: schedule.id,
                    role: i === 0 ? 'PRIMARY_OPERATOR' : 'BACKUP',
                    clockIn: tmpl.status !== 'SCHEDULED' ? clockIn : undefined,
                    clockOut: tmpl.status === 'COMPLETED' ? new Date(clockIn.getTime() + 8 * 3600000) : undefined,
                }
            });
        }
        if (supervisor) {
            const clockIn = new Date(tmpl.dateOffset.getTime() + parseInt(SHIFT_TEMPLATES[tmpl.shiftIdx].startTime.split(':')[0]) * 3600000);
            await prisma.operatorShift.create({
                data: {
                    userId: supervisor.id,
                    scheduleId: schedule.id,
                    role: 'SUPERVISOR',
                    clockIn: tmpl.status !== 'SCHEDULED' ? clockIn : undefined,
                    clockOut: tmpl.status === 'COMPLETED' ? new Date(clockIn.getTime() + 8 * 3600000) : undefined,
                }
            });
        }
    }

    // 9. Demo Scenario marker
    await prisma.demoScenario.upsert({
        where: { id: 'demo-scenario-main' },
        create: { id: 'demo-scenario-main', name: 'Smart Factory Demo', description: 'Fully seeded demo environment', isActive: true, config: JSON.stringify({ seededAt: new Date() }) },
        update: { isActive: true },
    });

    return { success: true, message: 'Demo data seeded successfully' };
}

// ─── Tick Function ───────────────────────────────────────────────────────────

export async function runDemoTick() {
    const machines = await prisma.machine.findMany({ include: { signals: true } });
    if (machines.length === 0) return { success: false, message: 'No machines found — run seed first' };

    const downtimeReasons = await prisma.downtimeReason.findMany();
    const sampleTask = await prisma.workflowTask.findFirst({ orderBy: { endTime: 'desc' } });
    const now = new Date();
    const updates: string[] = [];

    for (const machine of machines) {
        // Determine new status with weighted probabilities
        const rand = Math.random();
        let newStatus = machine.status;

        if (machine.status === 'RUNNING') {
            if (rand < 0.04) newStatus = 'DOWN';
            else if (rand < 0.07) newStatus = 'MAINTENANCE';
            else if (rand < 0.12) newStatus = 'IDLE';
        } else if (machine.status === 'IDLE') {
            if (rand < 0.55) newStatus = 'RUNNING';
            else if (rand < 0.60) newStatus = 'DOWN';
        } else if (machine.status === 'DOWN') {
            if (rand < 0.25) newStatus = 'IDLE';
            else if (rand < 0.30) newStatus = 'MAINTENANCE';
        } else if (machine.status === 'MAINTENANCE') {
            if (rand < 0.20) newStatus = 'IDLE';
        }

        // OEE drift
        let newOee = machine.oee + (Math.random() * 4 - 2); // ±2%
        newOee = Math.min(98, Math.max(15, newOee));
        if (newStatus === 'DOWN') newOee = Math.max(5, newOee * 0.6);
        if (newStatus === 'RUNNING') newOee = Math.min(98, newOee * 1.05);

        await prisma.machine.update({
            where: { id: machine.id },
            data: { status: newStatus, oee: Math.round(newOee) },
        });

        if (newStatus !== machine.status) {
            updates.push(`${machine.code}: ${machine.status} → ${newStatus}`);
            eventBus.publish({
                type: 'machine.status.changed',
                source: 'DemoService',
                machineId: machine.id,
                payload: { machineId: machine.id, code: machine.code, oldStatus: machine.status, newStatus, oee: newOee },
            });

            // Log machine event
            await prisma.machineEvent.create({
                data: {
                    machineId: machine.id,
                    eventType: 'STATUS_CHANGE',
                    severity: newStatus === 'DOWN' ? 'WARNING' : 'INFO',
                    description: `Machine ${machine.code} status changed: ${machine.status} → ${newStatus}`,
                },
            });
        }

        // Write telemetry for each signal
        for (const signal of machine.signals) {
            const min = signal.minValue ?? 0;
            const max = signal.maxValue ?? 100;
            let value: number;

            switch (signal.signalName) {
                case 'spindle_speed':
                    value = newStatus === 'RUNNING' ? 6000 + Math.random() * 4000 : Math.random() * 200;
                    break;
                case 'temperature':
                    value = newStatus === 'RUNNING' ? 55 + Math.random() * 20 : 22 + Math.random() * 8;
                    break;
                case 'vibration':
                    value = newStatus === 'RUNNING' ? 3 + Math.random() * 5 : Math.random() * 0.5;
                    break;
                case 'parts_counter':
                    value = newStatus === 'RUNNING' ? Math.floor(Math.random() * 50) : 0;
                    break;
                default:
                    value = min + Math.random() * (max - min);
            }

            value = Math.round(value * 100) / 100;
            const quality = newStatus === 'DOWN' ? 'BAD' : (value > max * 0.9 ? 'UNCERTAIN' : 'GOOD');

            await prisma.machineTelemetry.create({
                data: {
                    signalId: signal.id,
                    machineId: machine.id,
                    value: String(value),
                    quality,
                    timestamp: now,
                    sourceTimestamp: now,
                },
            });

            eventBus.publish({
                type: 'machine.telemetry.received',
                source: 'DemoService',
                machineId: machine.id,
                payload: { machineId: machine.id, signal: signal.signalName, value, unit: signal.unit, quality, timestamp: now },
            });
        }

        // 5% chance of downtime event for running machines transitioning to DOWN
        if (newStatus === 'DOWN' && machine.status === 'RUNNING') {
            const reason = downtimeReasons.length
                ? downtimeReasons[Math.floor(Math.random() * downtimeReasons.length)]
                : null;
            if (reason) {
                await prisma.downtimeEvent.create({
                    data: {
                        machineId: machine.id,
                        reasonId: reason.id,
                        startTime: now,
                        status: 'OPEN',
                    },
                });
                eventBus.publish({
                    type: 'downtime.started',
                    source: 'DemoService',
                    machineId: machine.id,
                    payload: { machineId: machine.id, reason: reason.name },
                });

                // Trigger Andon alert so it shows on dashboard immediately
                const demoDuration = 10 + Math.random() * 35;
                await AndonService.checkAndTriggerForDowntime(machine.id, demoDuration);
            }
        }

        // Close open downtimes when machine recovers
        if (newStatus !== 'DOWN' && machine.status === 'DOWN') {
            const openDowntimes = await prisma.downtimeEvent.findMany({
                where: { machineId: machine.id, status: 'OPEN', endTime: null },
            });
            for (const dt of openDowntimes) {
                const durationMinutes = (now.getTime() - dt.startTime.getTime()) / 60000;
                await prisma.downtimeEvent.update({
                    where: { id: dt.id },
                    data: { endTime: now, durationMinutes, status: 'CLOSED' },
                });
                eventBus.publish({
                    type: 'downtime.ended',
                    source: 'DemoService',
                    machineId: machine.id,
                    payload: { machineId: machine.id, durationMinutes },
                });
            }
        }

        // Random quality checks to populate scrap pareto (ties to existing tasks when present)
        if (newStatus === 'RUNNING' && sampleTask && Math.random() < 0.25) {
            const parameter = QC_PARAMS[Math.floor(Math.random() * QC_PARAMS.length)];
            const isFail = Math.random() < 0.18;
            const expected = 'OK';
            const actual = isFail ? 'FAIL' : 'OK';
            await prisma.qualityCheck.create({
                data: {
                    taskId: sampleTask.id,
                    parameter,
                    expected,
                    actual,
                    result: isFail ? 'FAIL' : 'PASS',
                },
            });
        }
    }

    // Log system event
    await prisma.systemEvent.create({
        data: {
            eventType: 'DEMO_TICK',
            details: `Demo tick: ${updates.length > 0 ? updates.join(', ') : 'All machines nominal'}`,
        },
    });

    return { success: true, updates, machineCount: machines.length };
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function getDemoStatus() {
    const scenario = await prisma.demoScenario.findUnique({ where: { id: 'demo-scenario-main' } });
    const machineCount = await prisma.machine.count();
    const orderCount = await prisma.workOrder.count();
    const telemetryCount = await prisma.machineTelemetry.count();

    return {
        isSeeded: !!scenario && machineCount > 0,
        isActive: scenario?.isActive ?? false,
        machineCount,
        orderCount,
        telemetryCount,
        seededAt: scenario ? JSON.parse(scenario.config as string).seededAt : null,
    };
}
