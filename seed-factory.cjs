/**
 * seed-factory.cjs
 * Seeds full factory demo data into production PostgreSQL.
 * Run with: DATABASE_URL="postgresql://..." node seed-factory.cjs
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { randomUUID: uuid } = require('crypto');

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function hoursAgo(n)    { return new Date(Date.now() - n * 3600 * 1000); }
function minsAgo(n)     { return new Date(Date.now() - n * 60 * 1000); }
function daysAgo(n)     { return new Date(Date.now() - n * 24 * 3600 * 1000); }
function daysFromNow(n) { return new Date(Date.now() + n * 24 * 3600 * 1000); }

async function main() {
  console.log('Seeding factory data...\n');

  // ─────────────────────────────────────────────────────────
  // 1. DIGITAL TWIN HIERARCHY
  // ─────────────────────────────────────────────────────────
  console.log('  Creating factory hierarchy...');

  const enterprise = await prisma.enterprise.upsert({
    where:  { code: 'PARTRACE-ENT' },
    update: {},
    create: { id: uuid(), code: 'PARTRACE-ENT', name: 'ParTraceflow Industries', country: 'Australia', timezone: 'Australia/Perth' },
  });

  const plant = await prisma.plant.upsert({
    where:  { code: 'PLANT-01' },
    update: {},
    create: { id: uuid(), code: 'PLANT-01', name: 'Factory Floor - Building 1', location: 'Perth, WA', enterpriseId: enterprise.id },
  });

  let area = await prisma.productionArea.findFirst({ where: { code: 'AREA-A', plantId: plant.id } });
  if (!area) {
    area = await prisma.productionArea.create({
      data: { id: uuid(), code: 'AREA-A', name: 'Main Production Area', plantId: plant.id },
    });
  }

  let lineA = await prisma.productionLine.findFirst({ where: { code: 'LINE-A', areaId: area.id } });
  if (!lineA) {
    lineA = await prisma.productionLine.create({
      data: { id: uuid(), code: 'LINE-A', name: 'Assembly Line A', areaId: area.id, targetCycleTime: 45 },
    });
  }

  let lineB = await prisma.productionLine.findFirst({ where: { code: 'LINE-B', areaId: area.id } });
  if (!lineB) {
    lineB = await prisma.productionLine.create({
      data: { id: uuid(), code: 'LINE-B', name: 'Welding & Fabrication Line', areaId: area.id, targetCycleTime: 90 },
    });
  }

  // ─────────────────────────────────────────────────────────
  // 2. MACHINES
  // ─────────────────────────────────────────────────────────
  console.log('  Creating machines...');

  const machineData = [
    { code: 'CNC-01', name: 'CNC Machining Centre #1',  status: 'RUNNING',     lineId: lineA.id },
    { code: 'CNC-02', name: 'CNC Machining Centre #2',  status: 'RUNNING',     lineId: lineA.id },
    { code: 'WLD-01', name: 'Welding Station #1',       status: 'RUNNING',     lineId: lineB.id },
    { code: 'WLD-02', name: 'Welding Station #2',       status: 'DOWN',        lineId: lineB.id },
    { code: 'ASM-01', name: 'Assembly Bay #1',          status: 'RUNNING',     lineId: lineA.id },
    { code: 'ASM-02', name: 'Assembly Bay #2',          status: 'IDLE',        lineId: lineA.id },
    { code: 'PNT-01', name: 'Paint & Coating Station',  status: 'MAINTENANCE', lineId: lineB.id },
    { code: 'INS-01', name: 'Final Inspection Station', status: 'RUNNING',     lineId: lineA.id },
  ];

  const machines = [];
  for (const m of machineData) {
    const machine = await prisma.machine.upsert({
      where:  { code: m.code },
      update: { status: m.status, productionLineId: m.lineId },
      create: { id: uuid(), code: m.code, name: m.name, status: m.status, oee: rand(55, 88), productionLineId: m.lineId },
    });
    machines.push(machine);
  }

  // ─────────────────────────────────────────────────────────
  // 3. DOWNTIME CATEGORIES & REASONS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating downtime categories...');

  const catUnplanned = await prisma.downtimeCategory.upsert({
    where: { code: 'UNPLANNED' },
    update: {},
    create: { id: uuid(), code: 'UNPLANNED', name: 'Unplanned Downtime', type: 'UNPLANNED' },
  });
  const catPlanned = await prisma.downtimeCategory.upsert({
    where: { code: 'PLANNED' },
    update: {},
    create: { id: uuid(), code: 'PLANNED', name: 'Planned Downtime', type: 'PLANNED' },
  });

  const reasonsData = [
    { code: 'ELEC-FAULT', name: 'Electrical Fault',      catId: catUnplanned.id },
    { code: 'MECH-BREAK', name: 'Mechanical Breakdown',  catId: catUnplanned.id },
    { code: 'TOOL-BREAK', name: 'Broken Tool / Tooling', catId: catUnplanned.id },
    { code: 'MAT-SHORT',  name: 'Material Shortage',     catId: catUnplanned.id },
    { code: 'QUAL-HOLD',  name: 'Quality Hold',          catId: catUnplanned.id },
    { code: 'PREV-MAINT', name: 'Preventive Maintenance',catId: catPlanned.id   },
    { code: 'CHANGEOVER', name: 'Setup / Changeover',    catId: catPlanned.id   },
    { code: 'OP-BREAK',   name: 'Operator Break',        catId: catPlanned.id   },
  ];

  const reasons = {};
  for (const r of reasonsData) {
    const reason = await prisma.downtimeReason.upsert({
      where:  { code: r.code },
      update: {},
      create: { id: uuid(), code: r.code, name: r.name, categoryId: r.catId },
    });
    reasons[r.code] = reason;
  }

  // ─────────────────────────────────────────────────────────
  // 4. DOWNTIME EVENTS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating downtime events...');

  const wld02 = machines.find(m => m.code === 'WLD-02');
  const pnt01 = machines.find(m => m.code === 'PNT-01');

  // Open events (machine is currently down/maintenance)
  const openWld02 = await prisma.downtimeEvent.findFirst({ where: { machineId: wld02.id, status: 'OPEN' } });
  if (!openWld02) {
    await prisma.downtimeEvent.create({ data: {
      id: uuid(), machineId: wld02.id, reasonId: reasons['ELEC-FAULT'].id,
      startTime: minsAgo(47), status: 'OPEN',
      reportedBy: 'operator', rootCause: 'Contactor on panel B failed — replacement on order',
    }});
  }

  const openPnt01 = await prisma.downtimeEvent.findFirst({ where: { machineId: pnt01.id, status: 'OPEN' } });
  if (!openPnt01) {
    await prisma.downtimeEvent.create({ data: {
      id: uuid(), machineId: pnt01.id, reasonId: reasons['PREV-MAINT'].id,
      startTime: hoursAgo(3), status: 'OPEN',
      reportedBy: 'supervisor', rootCause: 'Scheduled 500-hour service',
    }});
  }

  // Historical closed events (last 24h) — feeds the Pareto chart
  const closedDT = [
    { code: 'CNC-01', r: 'TOOL-BREAK', mins: 38, hBack: 22 },
    { code: 'CNC-02', r: 'CHANGEOVER', mins: 25, hBack: 19 },
    { code: 'ASM-01', r: 'MAT-SHORT',  mins: 18, hBack: 16 },
    { code: 'WLD-01', r: 'QUAL-HOLD',  mins: 32, hBack: 14 },
    { code: 'CNC-01', r: 'MECH-BREAK', mins: 45, hBack: 10 },
    { code: 'INS-01', r: 'OP-BREAK',   mins: 12, hBack:  8 },
    { code: 'ASM-02', r: 'ELEC-FAULT', mins: 55, hBack:  6 },
    { code: 'CNC-02', r: 'PREV-MAINT', mins: 60, hBack:  4 },
    { code: 'WLD-01', r: 'TOOL-BREAK', mins: 22, hBack:  2 },
  ];
  for (const d of closedDT) {
    const machine = machines.find(m => m.code === d.code);
    const start = hoursAgo(d.hBack);
    const end   = new Date(start.getTime() + d.mins * 60 * 1000);
    await prisma.downtimeEvent.create({ data: {
      id: uuid(), machineId: machine.id, reasonId: reasons[d.r].id,
      startTime: start, endTime: end, durationMinutes: d.mins, status: 'CLOSED',
    }});
  }

  // ─────────────────────────────────────────────────────────
  // 5. PRODUCTS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating products...');

  const productsData = [
    { sku: 'VALVE-6IN',   name: '6" Gate Valve Assembly',       desc: 'DN150 gate valve, carbon steel' },
    { sku: 'FLANGE-4IN',  name: '4" Weld Neck Flange',          desc: 'ANSI 300# raised face' },
    { sku: 'ELBOW-90',    name: '90 Degree Elbow - 8 inch LR',  desc: 'ASTM A234 WPB long radius' },
    { sku: 'SPOOL-ASSY',  name: 'Pre-Fabricated Spool Type A',  desc: 'Carbon steel, painted' },
    { sku: 'REDUCER-6X4', name: '6x4 inch Concentric Reducer',  desc: 'Seamless, ASTM A234 WPB' },
  ];

  const products = {};
  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where:  { sku: p.sku },
      update: {},
      create: { id: uuid(), sku: p.sku, name: p.name, description: p.desc },
    });
    products[p.sku] = product;
  }

  // ─────────────────────────────────────────────────────────
  // 6. WORKFLOW STEP DEFINITIONS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating workflow step definitions...');

  const stepNames = ['Material Prep', 'Fabrication', 'Welding', 'Quality Inspection', 'Painting', 'Final Assembly', 'Pressure Test', 'Pack and Dispatch'];
  const stepDefs = [];
  for (let i = 0; i < stepNames.length; i++) {
    let step = await prisma.workflowStepDef.findFirst({ where: { name: stepNames[i] } });
    if (!step) step = await prisma.workflowStepDef.create({ data: { id: uuid(), name: stepNames[i], sequence: i + 1 } });
    stepDefs.push(step);
  }

  // ─────────────────────────────────────────────────────────
  // 7. WORK ORDERS + TASKS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating work orders and production tasks...');

  const workOrdersData = [
    { num: 'WO-2024-001', sku: 'VALVE-6IN',   qty: 12, status: 'COMPLETED',   dueInDays: 5  },
    { num: 'WO-2024-002', sku: 'FLANGE-4IN',  qty: 48, status: 'COMPLETED',   dueInDays: 3  },
    { num: 'WO-2024-003', sku: 'ELBOW-90',    qty: 24, status: 'IN_PROGRESS', dueInDays: -2 },
    { num: 'WO-2024-004', sku: 'SPOOL-ASSY',  qty: 8,  status: 'IN_PROGRESS', dueInDays: -5 },
    { num: 'WO-2024-005', sku: 'REDUCER-6X4', qty: 20, status: 'RELEASED',    dueInDays: -8 },
    { num: 'WO-2024-006', sku: 'VALVE-6IN',   qty: 6,  status: 'RELEASED',    dueInDays:-10 },
    { num: 'WO-2024-007', sku: 'FLANGE-4IN',  qty: 100,status: 'IN_PROGRESS', dueInDays: -3 },
    { num: 'WO-2024-008', sku: 'ELBOW-90',    qty: 36, status: 'RELEASED',    dueInDays:-14 },
  ];

  const activeMachines = machines.filter(m => m.status !== 'DOWN' && m.status !== 'MAINTENANCE');
  let mIdx = 0;

  for (const wo of workOrdersData) {
    const existing = await prisma.workOrder.findUnique({ where: { orderNumber: wo.num } });
    if (existing) continue;

    const workOrder = await prisma.workOrder.create({ data: {
      id: uuid(), orderNumber: wo.num, quantity: wo.qty,
      priority: rand(1, 3), status: wo.status,
      dueDate: daysFromNow(wo.dueInDays * -1),
      productId: products[wo.sku].id,
      scheduledStart: daysAgo(rand(2, 10)),
      scheduledEnd:   daysFromNow(rand(1, 14)),
    }});

    const instance = await prisma.workflowInstance.create({ data: {
      id: uuid(),
      status: wo.status === 'COMPLETED' ? 'COMPLETED' : wo.status === 'IN_PROGRESS' ? 'ACTIVE' : 'PENDING',
      workOrderId: workOrder.id,
    }});

    // Create completed tasks (for OEE + production chart)
    const stepsCount = wo.status === 'COMPLETED' ? stepDefs.length : wo.status === 'IN_PROGRESS' ? rand(2, 5) : 0;
    for (let s = 0; s < stepsCount; s++) {
      const machine = activeMachines[mIdx % activeMachines.length]; mIdx++;
      const hStart = rand(2, 22);
      const hEnd   = Math.max(0, hStart - rand(1, 3));
      const task = await prisma.workflowTask.create({ data: {
        id: uuid(), status: 'COMPLETED',
        instanceId: instance.id,
        stepDefId:  stepDefs[s % stepDefs.length].id,
        machineId:  machine.id,
        startTime:  hoursAgo(hStart),
        endTime:    hoursAgo(hEnd),
      }});

      // Quality check per task
      const pass = rand(1, 10) > 2;
      await prisma.qualityCheck.create({ data: {
        id: uuid(),
        parameter: ['Dimensional Check','Surface Finish','Weld Visual','Torque Check','Pressure Test'][rand(0,4)],
        expected: 'Within spec',
        actual:   pass ? 'Within spec' : 'Out of tolerance',
        result:   pass ? 'PASS' : 'FAIL',
        taskId:   task.id,
      }});
    }
  }

  // ─────────────────────────────────────────────────────────
  // 8. INSPECTION RECORDS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating inspection records...');

  const allOrders = await prisma.workOrder.findMany({ take: 6, where: { status: { in: ['COMPLETED', 'IN_PROGRESS'] } } });
  for (const order of allOrders) {
    const existing = await prisma.inspectionRecord.findFirst({ where: { workOrderId: order.id } });
    if (existing) continue;
    await prisma.inspectionRecord.create({ data: {
      id: uuid(), workOrderId: order.id,
      inspector: ['Ali Hassan','Sarah Chen','Mike Torres','Priya Singh'][rand(0,3)],
      result: rand(1,10) > 2 ? 'PASS' : rand(0,1) ? 'REWORK' : 'FAIL',
      notes: 'Routine dimensional inspection completed.',
    }});
  }

  // ─────────────────────────────────────────────────────────
  // 9. ANDON BOARD & ALERTS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating Andon board and alerts...');

  const andonBoard = await prisma.andonBoard.upsert({
    where:  { code: 'ANDON-MAIN' },
    update: {},
    create: { id: uuid(), code: 'ANDON-MAIN', name: 'Main Floor Andon Board', location: 'Building 1 - South Wall', type: 'DIGITAL', isActive: true },
  });

  const andonData = [
    { machCode: 'WLD-02', msg: 'Welding Station #2 is DOWN - electrical fault on contactor', severity: 'CRITICAL', color: 'RED',    reason: 'Machine stopped - electrical fault' },
    { machCode: 'PNT-01', msg: 'Paint Station under scheduled maintenance - resume after 16:00', severity: 'WARNING', color: 'YELLOW', reason: 'Planned maintenance in progress' },
  ];
  for (const a of andonData) {
    const machine = machines.find(m => m.code === a.machCode);
    const existing = await prisma.andonEvent.findFirst({ where: { machineId: machine.id, resolvedAt: null } });
    if (existing) continue;
    await prisma.andonEvent.create({ data: {
      id: uuid(), boardId: andonBoard.id, machineId: machine.id,
      triggeredBy: 'SYSTEM', reason: a.reason, severity: a.severity,
      color: a.color, message: a.msg, acknowledged: false,
      timestamp: minsAgo(rand(10, 60)),
    }});
  }

  // ─────────────────────────────────────────────────────────
  // 10. SHIFTS
  // ─────────────────────────────────────────────────────────
  console.log('  Creating shifts...');
  for (const s of [
    { code: 'SHIFT-A', name: 'Morning Shift',   start: '06:00', end: '14:00', hours: 8 },
    { code: 'SHIFT-B', name: 'Afternoon Shift', start: '14:00', end: '22:00', hours: 8 },
    { code: 'SHIFT-C', name: 'Night Shift',     start: '22:00', end: '06:00', hours: 8 },
  ]) {
    const ex = await prisma.shift.findFirst({ where: { code: s.code, plantId: plant.id } });
    if (!ex) await prisma.shift.create({ data: { id: uuid(), plantId: plant.id, code: s.code, name: s.name, startTime: s.start, endTime: s.end, durationHours: s.hours } });
  }

  // ─────────────────────────────────────────────────────────
  // 11. PIPE SPOOL DATA
  // ─────────────────────────────────────────────────────────
  console.log('  Creating pipe spool lines...');

  const linesData = [
    { lineNumber: 'PL-001-A', area: 'Process Area 1', service: 'Crude Oil Feed',    material: 'CS A106-B', size: '6"',  pidNumber: 'P-ID-001', dp: 150, dt: 120 },
    { lineNumber: 'PL-002-A', area: 'Process Area 1', service: 'Gas Injection',     material: 'CS A53-B',  size: '4"',  pidNumber: 'P-ID-002', dp: 200, dt: 80  },
    { lineNumber: 'PL-003-B', area: 'Utilities',      service: 'Cooling Water',     material: 'CS A53-B',  size: '8"',  pidNumber: 'P-ID-010', dp: 50,  dt: 45  },
    { lineNumber: 'PL-004-B', area: 'Utilities',      service: 'Instrument Air',    material: 'SS 316L',   size: '2"',  pidNumber: 'P-ID-011', dp: 100, dt: 40  },
    { lineNumber: 'PL-005-C', area: 'Flare System',   service: 'Flare Header',      material: 'CS A106-B', size: '12"', pidNumber: 'P-ID-020', dp: 30,  dt: 300 },
    { lineNumber: 'PL-006-C', area: 'Process Area 2', service: 'Hydrocarbon Drain', material: 'CS A106-B', size: '3"',  pidNumber: 'P-ID-021', dp: 120, dt: 150 },
  ];

  const spoolLines = {};
  for (const l of linesData) {
    const existing = await prisma.pipeSpoolLine.findUnique({ where: { lineNumber: l.lineNumber } });
    if (existing) { spoolLines[l.lineNumber] = existing; continue; }
    const line = await prisma.pipeSpoolLine.create({ data: {
      id: uuid(), lineNumber: l.lineNumber, area: l.area, service: l.service,
      material: l.material, size: l.size, pidNumber: l.pidNumber,
      designPressure: l.dp, designTemp: l.dt,
      revision: 'B', status: 'ACTIVE',
      testMedium: 'HYDROSTATIC', testPressure: l.dp * 1.5,
    }});
    spoolLines[l.lineNumber] = line;
  }

  console.log('  Creating isometric drawings...');
  const drawingsData = [
    { dn: 'ISO-001-A', title: 'PL-001-A Isometric Sheet 1', ln: 'PL-001-A' },
    { dn: 'ISO-001-B', title: 'PL-001-A Isometric Sheet 2', ln: 'PL-001-A' },
    { dn: 'ISO-002-A', title: 'PL-002-A Isometric Sheet 1', ln: 'PL-002-A' },
    { dn: 'ISO-003-A', title: 'PL-003-B Isometric Sheet 1', ln: 'PL-003-B' },
    { dn: 'ISO-004-A', title: 'PL-004-B Isometric Sheet 1', ln: 'PL-004-B' },
    { dn: 'ISO-005-A', title: 'PL-005-C Isometric Sheet 1', ln: 'PL-005-C' },
    { dn: 'ISO-006-A', title: 'PL-006-C Isometric Sheet 1', ln: 'PL-006-C' },
  ];
  const drawings = {};
  for (const d of drawingsData) {
    const existing = await prisma.isometricDrawing.findUnique({ where: { drawingNumber: d.dn } });
    if (existing) { drawings[d.dn] = existing; continue; }
    const drw = await prisma.isometricDrawing.create({ data: {
      id: uuid(), drawingNumber: d.dn, title: d.title,
      lineId: spoolLines[d.ln].id, revision: 'B', status: 'IFC',
      issuedDate: daysAgo(30), issuedBy: 'Engineering', approvedBy: 'Lead Engineer',
    }});
    drawings[d.dn] = drw;
  }

  console.log('  Creating pipe spools...');
  const spoolsData = [
    { id: 'SP-001-001', ln: 'PL-001-A', dn: 'ISO-001-A', status: 'COMPLETE',        joints: 3, size: '6"'  },
    { id: 'SP-001-002', ln: 'PL-001-A', dn: 'ISO-001-A', status: 'PRESSURE_TESTED', joints: 4, size: '6"'  },
    { id: 'SP-001-003', ln: 'PL-001-A', dn: 'ISO-001-B', status: 'NDE_CLEAR',       joints: 2, size: '6"'  },
    { id: 'SP-001-004', ln: 'PL-001-A', dn: 'ISO-001-B', status: 'WELDED',          joints: 3, size: '6"'  },
    { id: 'SP-002-001', ln: 'PL-002-A', dn: 'ISO-002-A', status: 'NDE_PENDING',     joints: 2, size: '4"'  },
    { id: 'SP-002-002', ln: 'PL-002-A', dn: 'ISO-002-A', status: 'FIT_UP',          joints: 3, size: '4"'  },
    { id: 'SP-002-003', ln: 'PL-002-A', dn: 'ISO-002-A', status: 'ISSUED',          joints: 2, size: '4"'  },
    { id: 'SP-003-001', ln: 'PL-003-B', dn: 'ISO-003-A', status: 'IN_STORAGE',      joints: 4, size: '8"'  },
    { id: 'SP-003-002', ln: 'PL-003-B', dn: 'ISO-003-A', status: 'RECEIVED',        joints: 3, size: '8"'  },
    { id: 'SP-003-003', ln: 'PL-003-B', dn: 'ISO-003-A', status: 'HOLD',            joints: 2, size: '8"'  },
    { id: 'SP-004-001', ln: 'PL-004-B', dn: 'ISO-004-A', status: 'COMPLETE',        joints: 2, size: '2"'  },
    { id: 'SP-004-002', ln: 'PL-004-B', dn: 'ISO-004-A', status: 'FABRICATING',     joints: 2, size: '2"'  },
    { id: 'SP-005-001', ln: 'PL-005-C', dn: 'ISO-005-A', status: 'COMPLETE',        joints: 5, size: '12"' },
    { id: 'SP-005-002', ln: 'PL-005-C', dn: 'ISO-005-A', status: 'NDE_PENDING',     joints: 4, size: '12"' },
    { id: 'SP-005-003', ln: 'PL-005-C', dn: 'ISO-005-A', status: 'WELDED',          joints: 3, size: '12"' },
    { id: 'SP-006-001', ln: 'PL-006-C', dn: 'ISO-006-A', status: 'ISSUED',          joints: 2, size: '3"'  },
    { id: 'SP-006-002', ln: 'PL-006-C', dn: 'ISO-006-A', status: 'IN_STORAGE',      joints: 3, size: '3"'  },
    { id: 'SP-006-003', ln: 'PL-006-C', dn: 'ISO-006-A', status: 'FABRICATING',     joints: 2, size: '3"'  },
  ];

  const hasPastStatus = s => ['COMPLETE','PRESSURE_TESTED','NDE_CLEAR','NDE_PENDING','WELDED','FIT_UP','ISSUED','IN_STORAGE','HOLD'].includes(s);
  const spools = {};
  for (const s of spoolsData) {
    const existing = await prisma.pipeSpool.findUnique({ where: { spoolId: s.id } });
    if (existing) { spools[s.id] = existing; continue; }
    const spool = await prisma.pipeSpool.create({ data: {
      id: uuid(), spoolId: s.id,
      lineId:    spoolLines[s.ln].id,
      drawingId: drawings[s.dn]?.id,
      material:  spoolLines[s.ln].material,
      size:      s.size,
      schedule:  'SCH-40',
      status:    s.status,
      fabricatedBy: 'ParTraceflow Fab Shop',
      fabricationDate: daysAgo(rand(10, 60)),
      receivedAt: hasPastStatus(s.status) ? daysAgo(rand(5, 20)) : null,
      storageZone: s.status === 'IN_STORAGE' ? ['ZONE-A','ZONE-B','ZONE-C'][rand(0,2)] : null,
      storageRack: s.status === 'IN_STORAGE' ? `R-${rand(1,10).toString().padStart(2,'0')}` : null,
    }});
    spools[s.id] = spool;
  }

  console.log('  Creating spool joints...');
  const jointStatusMap = {
    COMPLETE: 'COMPLETE', PRESSURE_TESTED: 'PRESSURE_TESTED',
    NDE_CLEAR: 'NDE_CLEAR', NDE_PENDING: 'NDE_PENDING',
    WELDED: 'WELDED', FIT_UP: 'FIT_UP',
    ISSUED: 'PENDING', IN_STORAGE: 'PENDING',
    RECEIVED: 'PENDING', HOLD: 'HOLD', FABRICATING: 'PENDING',
  };
  for (const s of spoolsData) {
    const spool = spools[s.id];
    if (!spool) continue;
    const jStatus = jointStatusMap[s.status] ?? 'PENDING';
    for (let j = 0; j < s.joints; j++) {
      const jId = `J-${s.id}-${(j+1).toString().padStart(2,'0')}`;
      const existing = await prisma.spoolJoint.findUnique({ where: { jointId: jId } });
      if (existing) continue;
      await prisma.spoolJoint.create({ data: {
        id: uuid(), jointId: jId, spoolId: spool.id,
        jointType:     j === 0 ? 'FIELD_WELD' : 'SHOP_WELD',
        size:          s.size,
        material:      spoolLines[s.ln].material,
        weldProcedure: 'WPS-CS-001',
        welderId:      ['WLD-001','WLD-002','WLD-003'][rand(0,2)],
        ndeRequired:   true, ndeType: 'RT', ndePercent: 100,
        status:    jStatus,
        holdFlag:  s.status === 'HOLD',
        holdReason: s.status === 'HOLD' ? 'NDE result disputed - re-inspection required' : null,
      }});
    }
  }

  // ITP Template
  console.log('  Creating ITP template...');
  let itpTemplate = await prisma.iTPTemplate.findFirst({ where: { name: 'Standard Spool ITP' } });
  if (!itpTemplate) {
    itpTemplate = await prisma.iTPTemplate.create({ data: {
      id: uuid(), name: 'Standard Spool ITP',
      description: 'Standard inspection and test plan for pipe spool fabrication',
      type: 'SPOOL', isActive: true,
    }});
    const itpSteps = [
      { seq: 1, code: 'ITP-01', desc: 'Dimensional Check vs isometric drawing' },
      { seq: 2, code: 'ITP-02', desc: 'Material Certificate Review' },
      { seq: 3, code: 'ITP-03', desc: 'Weld Visual Inspection (VT)' },
      { seq: 4, code: 'ITP-04', desc: 'NDE - Radiographic Test (RT)' },
      { seq: 5, code: 'ITP-05', desc: 'Hydrostatic Pressure Test' },
      { seq: 6, code: 'ITP-06', desc: 'Painting and Coating Inspection' },
      { seq: 7, code: 'ITP-07', desc: 'Final Visual Inspection and Punch List' },
    ];
    for (const st of itpSteps) {
      await prisma.iTPStep.create({ data: {
        id: uuid(), itpId: itpTemplate.id, sequence: st.seq,
        code: st.code, description: st.desc,
        checkType: 'INSPECTION', discipline: 'QC',
        inspectorRole: 'QC_INSPECTOR', mandatory: true,
      }});
    }
  }

  // Spool Inspections
  console.log('  Creating spool inspections...');
  const itpSteps = await prisma.iTPStep.findMany({ where: { itpId: itpTemplate.id } });
  const inspectionSpools = spoolsData.filter(s => ['COMPLETE','PRESSURE_TESTED','NDE_CLEAR','NDE_PENDING'].includes(s.status));
  for (const s of inspectionSpools.slice(0, 8)) {
    const spool = spools[s.id];
    if (!spool) continue;
    const existing = await prisma.spoolInspection.findFirst({ where: { spoolId: spool.id } });
    if (existing) continue;
    const step = itpSteps[rand(0, itpSteps.length - 1)];
    await prisma.spoolInspection.create({ data: {
      id: uuid(), spoolId: spool.id, itpId: itpTemplate.id, itpStepId: step?.id,
      inspectionType: 'VISUAL',
      result: rand(1,10) > 1 ? 'PASS' : 'FAIL',
      inspector: ['Ali Hassan','Sarah Chen','Mike Torres','Priya Singh'][rand(0,3)],
      inspectorRole: 'QC_INSPECTOR',
      inspectedAt: daysAgo(rand(1,7)),
      clientPresent: rand(0,1) === 1,
    }});
  }

  // NCR Records
  console.log('  Creating NCR records...');
  const holdSpool = spools['SP-003-003'];
  if (holdSpool) {
    const ex = await prisma.nCRRecord.findFirst({ where: { ncrNumber: 'NCR-2024-001' } });
    if (!ex) {
      await prisma.nCRRecord.create({ data: {
        id: uuid(), ncrNumber: 'NCR-2024-001',
        title: 'Weld undercut exceeds code tolerance',
        relatedType: 'SPOOL',
        spoolId: holdSpool.id,
        issueDescription: 'Visual inspection revealed undercut on weld bead exceeding ASME B31.3 acceptance criteria.',
        severity: 'CRITICAL', status: 'OPEN',
        detectedBy: 'Sarah Chen',
        detectedAt: daysAgo(3),
        disposition: 'REPAIR',
        dueDate: daysFromNow(5),
      }});
    }
  }
  const ncr2Spool = spools['SP-001-002'];
  if (ncr2Spool) {
    const ex2 = await prisma.nCRRecord.findFirst({ where: { ncrNumber: 'NCR-2024-002' } });
    if (!ex2) {
      await prisma.nCRRecord.create({ data: {
        id: uuid(), ncrNumber: 'NCR-2024-002',
        title: 'Paint thickness below minimum - DFT fail',
        relatedType: 'SPOOL',
        spoolId: ncr2Spool.id,
        issueDescription: 'Dry film thickness measured at 80 microns vs minimum 125 microns required.',
        severity: 'MINOR', status: 'CLOSED',
        detectedBy: 'Mike Torres',
        detectedAt: daysAgo(14),
        closedAt:   daysAgo(5),
        closedBy:   'QC Supervisor',
        correctiveAction: 'Additional coat applied, re-inspected and accepted.',
        disposition: 'REWORK',
      }});
    }
  }

  // NDE Records
  console.log('  Creating NDE records...');
  const ndeSpoolList = spoolsData.filter(s => ['NDE_PENDING','NDE_CLEAR','PRESSURE_TESTED','COMPLETE'].includes(s.status));
  for (const s of ndeSpoolList.slice(0, 5)) {
    const spool = spools[s.id];
    if (!spool) continue;
    const joints = await prisma.spoolJoint.findMany({ where: { spoolId: spool.id }, take: 2 });
    for (const joint of joints) {
      const existing = await prisma.nDERecord.findFirst({ where: { jointId: joint.id } });
      if (existing) continue;
      const passed = s.status !== 'NDE_PENDING';
      await prisma.nDERecord.create({ data: {
        id: uuid(), jointId: joint.id,
        ndeType:     'RT',
        technique:   'Single Wall Single Image',
        result:      passed ? 'ACCEPTABLE' : 'PENDING',
        holdFlag:    s.status === 'NDE_PENDING',
        xrayFilm:    `RT-${joint.jointId}`,
        inspector:   'RT-TECH-001',
        examinedAt:  daysAgo(rand(1, 10)),
        reviewedBy:  passed ? 'Level-II-001' : null,
        reportedAt:  passed ? daysAgo(rand(1, 5)) : null,
        notes:       passed ? 'Radiograph acceptable per acceptance criteria.' : 'Awaiting RT result review.',
      }});
    }
  }

  // Pressure Test Records
  console.log('  Creating pressure test records...');
  const ptSpools = spoolsData.filter(s => ['PRESSURE_TESTED','COMPLETE'].includes(s.status));
  for (const s of ptSpools) {
    const spool = spools[s.id];
    if (!spool) continue;
    const existing = await prisma.pressureTestRecord.findFirst({ where: { spoolId: spool.id } });
    if (existing) continue;
    await prisma.pressureTestRecord.create({ data: {
      id: uuid(), spoolId: spool.id,
      testType:   'HYDRO',
      testMedium: 'WATER',
      testPressure:   spoolLines[s.ln].dp * 1.5,
      designPressure: spoolLines[s.ln].dp,
      holdTime:    60,
      testDate:    daysAgo(rand(2, 12)),
      witnessedBy: 'QC Supervisor',
      result: 'PASS',
      notes: 'No leaks detected. Test passed per ASME B31.3.',
    }});
  }

  // Spool Approvals (pending for NDE_CLEAR spools)
  console.log('  Creating spool approvals...');
  const approvalSpools = spoolsData.filter(s => s.status === 'NDE_CLEAR');
  for (const s of approvalSpools) {
    const spool = spools[s.id];
    if (!spool) continue;
    const existing = await prisma.spoolApproval.findFirst({ where: { spoolId: spool.id } });
    if (existing) continue;
    await prisma.spoolApproval.create({ data: {
      id: uuid(),
      relatedType:  'SPOOL',
      spoolId:      spool.id,
      approverRole: 'QC_MANAGER',
      approverName: 'Pending Assignment',
      status:       'PENDING',
      comments:     'NDE results satisfactory - awaiting QC Manager sign-off.',
    }});
  }

  // Yard Locations for IN_STORAGE spools
  console.log('  Creating yard locations...');
  const storageSpools = spoolsData.filter(s => s.status === 'IN_STORAGE');
  let yardCounter = 1;
  for (const s of storageSpools) {
    const spool = spools[s.id];
    if (!spool) continue;
    const existing = await prisma.yardLocation.findFirst({ where: { spoolId: spool.id } });
    if (existing) { yardCounter++; continue; }
    const zones = ['ZONE-A','ZONE-B','ZONE-C'];
    const zone = zones[rand(0, 2)];
    const rack  = `R-${rand(1,10).toString().padStart(2,'0')}`;
    const row   = `ROW-${rand(1,5)}`;
    const pos   = `P-${yardCounter.toString().padStart(3,'0')}`;
    const fullAddress = `${zone}/${rack}/${row}/${pos}`;
    // Check fullAddress uniqueness
    const addrExists = await prisma.yardLocation.findUnique({ where: { fullAddress } });
    const finalAddr = addrExists ? `${fullAddress}-${uuid().slice(0,4)}` : fullAddress;
    await prisma.yardLocation.create({ data: {
      id: uuid(), spoolId: spool.id,
      zone, rack, row, position: pos,
      fullAddress: finalAddr,
      capacity: 1, occupied: true,
      notes: 'Stored as per yard plan',
    }});
    yardCounter++;
  }

  // Spool Alerts
  console.log('  Creating spool alerts...');
  const holdSpoolData = spoolsData.find(s => s.status === 'HOLD');
  if (holdSpoolData && spools[holdSpoolData.id]) {
    const ex = await prisma.spoolAlert.findFirst({ where: { spoolId: spools[holdSpoolData.id].id, type: 'HOLD_PLACED' } });
    if (!ex) {
      await prisma.spoolAlert.create({ data: {
        id: uuid(), type: 'HOLD_PLACED', severity: 'CRITICAL',
        title: 'Spool placed on HOLD',
        message: `Spool ${holdSpoolData.id} has been placed on hold - NDE result disputed`,
        spoolId: spools[holdSpoolData.id].id, read: false,
      }});
    }
  }
  // NCR raised alert
  if (holdSpool) {
    const ex = await prisma.spoolAlert.findFirst({ where: { spoolId: holdSpool.id, type: 'NCR_RAISED' } });
    if (!ex) {
      await prisma.spoolAlert.create({ data: {
        id: uuid(), type: 'NCR_RAISED', severity: 'CRITICAL',
        title: 'NCR-2024-001 raised - weld undercut',
        message: 'Critical NCR raised on SP-003-003: weld undercut exceeds code tolerance. Requires immediate repair.',
        spoolId: holdSpool.id, read: false,
      }});
    }
  }

  console.log('\nFactory seed complete!\n');
  console.log('Data seeded:');
  console.log('  8 machines (CNC, Welding, Assembly, Paint, Inspection)');
  console.log('  8 work orders (COMPLETED, IN_PROGRESS, RELEASED)');
  console.log('  2 open downtime events, 9 historical closed downtime events');
  console.log('  Quality checks and inspection records');
  console.log('  Andon alerts for DOWN machines');
  console.log('  6 pipe lines, 18 spools, joints, ITP template');
  console.log('  NCR records, NDE records, pressure test records, yard locations\n');
  console.log('Visit your deployed app - the dashboard should now show live data!\n');
}

main()
  .catch(e => { console.error('Seed failed:', e.message, e); process.exit(1); })
  .finally(() => prisma.$disconnect());
