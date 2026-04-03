/**
 * seed-demo.cjs
 * 1. Resets machines to all RUNNING (no permanent DOWN state)
 * 2. Closes open downtime events
 * 3. Resolves Andon alerts
 * 4. Adds rich dummy data: audit, machine health, SPC, recipes, traceability, shifts
 *
 * Run: DATABASE_URL="postgresql://..." node seed-demo.cjs
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const { randomUUID: uuid } = require('crypto');
const prisma = new PrismaClient();

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max, dp = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(dp)); }
function hoursAgo(n)    { return new Date(Date.now() - n * 3600 * 1000); }
function daysAgo(n)     { return new Date(Date.now() - n * 24 * 3600 * 1000); }
function minsAgo(n)     { return new Date(Date.now() - n * 60 * 1000); }
function daysFromNow(n) { return new Date(Date.now() + n * 24 * 3600 * 1000); }

async function main() {
  console.log('Starting demo data seed...\n');

  // ─────────────────────────────────────────────────────────
  // STEP 1 — Reset all machines to RUNNING (clean dashboard)
  // ─────────────────────────────────────────────────────────
  console.log('  Resetting machines to RUNNING...');
  await prisma.machine.updateMany({ data: { status: 'RUNNING' } });

  // Close any open downtime events (set endTime + CLOSED)
  const openDT = await prisma.downtimeEvent.findMany({ where: { status: 'OPEN' } });
  for (const dt of openDT) {
    const end = new Date(dt.startTime.getTime() + rand(20, 90) * 60 * 1000);
    await prisma.downtimeEvent.update({
      where: { id: dt.id },
      data: { status: 'CLOSED', endTime: end, durationMinutes: (end.getTime() - dt.startTime.getTime()) / 60000 },
    });
  }

  // Resolve all open Andon alerts
  await prisma.andonEvent.updateMany({
    where: { resolvedAt: null },
    data: { resolvedAt: minsAgo(5), acknowledged: true, acknowledgedBy: 'supervisor' },
  });
  console.log(`  Closed ${openDT.length} open downtime events. Dashboard will show GREEN.\n`);

  // ─────────────────────────────────────────────────────────
  // STEP 2 — Audit Trail (SystemEvent)
  // ─────────────────────────────────────────────────────────
  console.log('  Seeding audit trail events...');
  const users = await prisma.user.findMany();
  const adminUser = users.find(u => u.role === 'ADMIN') ?? users[0];
  const supervisorUser = users.find(u => u.role === 'SUPERVISOR') ?? users[0];
  const operatorUser = users.find(u => u.role === 'OPERATOR') ?? users[0];
  const machines = await prisma.machine.findMany();

  const auditEvents = [
    { type: 'WORKFLOW_START',    details: 'Work Order WO-2024-007 started — Flange 4" production run, qty 100 units',  userId: adminUser?.id,      ts: hoursAgo(8) },
    { type: 'TASK_ASSIGNED',     details: 'Task "Fabrication" assigned to Operator Ali Hassan on CNC-01',              userId: supervisorUser?.id,  ts: hoursAgo(7.5) },
    { type: 'TASK_COMPLETED',    details: 'Material Prep step completed for WO-2024-007 — 100 blanks prepared',        userId: operatorUser?.id,    ts: hoursAgo(7) },
    { type: 'QUALITY_CHECK',     details: 'Dimensional inspection PASSED for batch WO-2024-007-B1 — all within ±0.05mm', userId: adminUser?.id,    ts: hoursAgo(6.5) },
    { type: 'WORKFLOW_COMPLETE', details: 'Work Order WO-2024-002 completed — 48 flanges delivered to QC hold area',   userId: supervisorUser?.id,  ts: hoursAgo(6) },
    { type: 'TASK_ASSIGNED',     details: 'Welding task assigned to Welder Mike Torres on WLD-01',                     userId: supervisorUser?.id,  ts: hoursAgo(5.5) },
    { type: 'QUALITY_CHECK',     details: 'Weld visual inspection PASSED — SP-001-003, zero defects found',            userId: adminUser?.id,       ts: hoursAgo(5) },
    { type: 'TASK_COMPLETED',    details: 'NDE radiographic test completed on J-SP-001-003-01 — result ACCEPTABLE',    userId: operatorUser?.id,    ts: hoursAgo(4.5) },
    { type: 'SYSTEM_ERROR',      details: 'Downtime event logged: CNC-01 tool breakage — Broken Tool / Tooling, duration 38 min', userId: null, ts: hoursAgo(4) },
    { type: 'WORKFLOW_START',    details: 'Work Order WO-2024-003 started — 90° Elbow production, qty 24 units',       userId: adminUser?.id,       ts: hoursAgo(3.5) },
    { type: 'QUALITY_CHECK',     details: 'Pressure test PASSED for SP-001-002 — 225 bar held for 60 minutes',        userId: supervisorUser?.id,  ts: hoursAgo(3) },
    { type: 'TASK_ASSIGNED',     details: 'Paint & coating assigned on INS-01 — topcoat application started',          userId: supervisorUser?.id,  ts: hoursAgo(2.5) },
    { type: 'QUALITY_CHECK',     details: 'Surface inspection PASSED — paint DFT measured 135 microns (min 125 required)', userId: adminUser?.id,  ts: hoursAgo(2) },
    { type: 'WORKFLOW_COMPLETE', details: 'Work Order WO-2024-001 COMPLETED — 12 gate valves released for dispatch',   userId: adminUser?.id,       ts: hoursAgo(1.5) },
    { type: 'TASK_COMPLETED',    details: 'Shift Morning A completed — OEE 82%, 347 units produced vs 350 target',     userId: supervisorUser?.id,  ts: hoursAgo(1) },
    { type: 'QUALITY_CHECK',     details: 'NCR-2024-001 raised: weld undercut on SP-003-003 exceeds ASME B31.3 limits', userId: adminUser?.id,     ts: hoursAgo(0.75) },
    { type: 'TASK_ASSIGNED',     details: 'Corrective action assigned to Welder for NCR-2024-001 — repair weld',       userId: supervisorUser?.id,  ts: hoursAgo(0.5) },
    { type: 'WORKFLOW_START',    details: 'Work Order WO-2024-004 started — pre-fabricated spool assembly, qty 8',     userId: adminUser?.id,       ts: minsAgo(20) },
  ];

  const existingAudit = await prisma.systemEvent.count();
  if (existingAudit === 0) {
    for (const e of auditEvents) {
      await prisma.systemEvent.create({ data: {
        id: uuid(), eventType: e.type, details: e.details,
        userId: e.userId ?? null, timestamp: e.ts,
      }});
    }
    console.log(`  Created ${auditEvents.length} audit trail events.\n`);
  } else {
    console.log(`  Audit trail already has ${existingAudit} events — skipping.\n`);
  }

  // ─────────────────────────────────────────────────────────
  // STEP 3 — Machine Health Scores & Predictions
  // ─────────────────────────────────────────────────────────
  console.log('  Seeding machine health data...');

  const healthData = [
    { code: 'CNC-01', score: 88, vibration: 91, temp: 85, runtime: 90, current: 87, failProb: 0.08, rul: 1200, risk: 'LOW',    rec: 'Operating normally. Schedule next PM in 1200 hours.' },
    { code: 'CNC-02', score: 72, vibration: 68, temp: 75, runtime: 73, current: 72, failProb: 0.22, rul: 520,  risk: 'MEDIUM', rec: 'Elevated vibration detected on spindle bearing. Inspect within 30 days.' },
    { code: 'WLD-01', score: 91, vibration: 95, temp: 88, runtime: 92, current: 90, failProb: 0.05, rul: 1800, risk: 'LOW',    rec: 'Excellent condition. Continue current maintenance schedule.' },
    { code: 'WLD-02', score: 54, vibration: 48, temp: 62, runtime: 55, current: 51, failProb: 0.41, rul: 180,  risk: 'HIGH',   rec: 'Contactor wear detected. Replace main contactor within 7 days to avoid failure.' },
    { code: 'ASM-01', score: 83, vibration: 86, temp: 80, runtime: 84, current: 82, failProb: 0.14, rul: 900,  risk: 'LOW',    rec: 'Minor conveyor belt wear. Monitor and replace at next planned maintenance.' },
    { code: 'ASM-02', score: 76, vibration: 79, temp: 74, runtime: 77, current: 75, failProb: 0.19, rul: 620,  risk: 'MEDIUM', rec: 'Lubrication levels slightly low. Top up oil and check seal integrity.' },
    { code: 'PNT-01', score: 42, vibration: 40, temp: 45, runtime: 44, current: 40, failProb: 0.58, rul: 90,   risk: 'CRITICAL', rec: 'Spray nozzle clogged and pressure regulator failure imminent. Requires immediate service.' },
    { code: 'INS-01', score: 95, vibration: 97, temp: 94, runtime: 95, current: 94, failProb: 0.03, rul: 2400, risk: 'LOW',    rec: 'Machine in excellent health. No action required.' },
  ];

  for (const h of healthData) {
    const machine = machines.find(m => m.code === h.code);
    if (!machine) continue;
    const ex = await prisma.machineHealthScore.findFirst({ where: { machineId: machine.id } });
    if (!ex) {
      await prisma.machineHealthScore.create({ data: {
        id: uuid(), machineId: machine.id,
        overallScore: h.score, vibrationScore: h.vibration,
        temperatureScore: h.temp, runtimeScore: h.runtime,
        currentScore: h.current, modelVersion: 'v1',
      }});
    }
    const exPred = await prisma.healthPrediction.findFirst({ where: { machineId: machine.id } });
    if (!exPred) {
      await prisma.healthPrediction.create({ data: {
        id: uuid(), machineId: machine.id,
        predictionType: 'FAILURE_PROBABILITY',
        value: h.failProb,
        confidence: 0.87,
        predictedFailureDate: h.risk === 'CRITICAL' ? daysFromNow(4) : h.risk === 'HIGH' ? daysFromNow(14) : null,
        recommendedAction: h.rec,
        featureSnapshot: JSON.stringify({ vibration: h.vibration, temp: h.temp, runtime: h.runtime }),
        modelVersion: 'v1',
      }});
    }
  }
  console.log(`  Created machine health scores for ${healthData.length} machines.\n`);

  // ─────────────────────────────────────────────────────────
  // STEP 4 — SPC: Process Parameters + Records + Control Limits
  // ─────────────────────────────────────────────────────────
  console.log('  Seeding SPC process data...');

  const spcParams = [
    {
      machine: 'CNC-01', name: 'Bore Diameter', unit: 'mm',
      nominal: 50.00, usl: 50.10, lsl: 49.90, ucl: 50.075, lcl: 49.925, cl: 50.00,
      cp: 1.45, cpk: 1.38,
      points: Array.from({ length: 50 }, (_, i) => ({
        val: 50.00 + (Math.random() - 0.5) * 0.08 + (i === 15 ? 0.09 : i === 32 ? -0.085 : 0),
        inControl: !(i === 15 || i === 32),
        violation: i === 15 ? 'NELSON_1' : i === 32 ? 'NELSON_1' : null,
        ts: hoursAgo(50 - i * 0.4),
      })),
    },
    {
      machine: 'CNC-02', name: 'Flange Face Flatness', unit: 'mm',
      nominal: 0.00, usl: 0.05, lsl: -0.05, ucl: 0.038, lcl: -0.038, cl: 0.001,
      cp: 1.31, cpk: 1.28,
      points: Array.from({ length: 45 }, (_, i) => ({
        val: 0.001 + (Math.random() - 0.5) * 0.032,
        inControl: true,
        violation: null,
        ts: hoursAgo(45 - i * 0.45),
      })),
    },
    {
      machine: 'WLD-01', name: 'Weld Bead Width', unit: 'mm',
      nominal: 8.0, usl: 9.5, lsl: 6.5, ucl: 9.1, lcl: 6.9, cl: 8.0,
      cp: 1.22, cpk: 1.18,
      points: Array.from({ length: 40 }, (_, i) => ({
        val: 8.0 + (Math.random() - 0.5) * 1.6 + (i > 35 ? 0.5 : 0),
        inControl: i <= 35,
        violation: i > 35 ? 'WESTERN_ELECTRIC_2' : null,
        ts: hoursAgo(40 - i * 0.5),
      })),
    },
    {
      machine: 'ASM-01', name: 'Torque Setting', unit: 'Nm',
      nominal: 120.0, usl: 130.0, lsl: 110.0, ucl: 127.5, lcl: 112.5, cl: 120.0,
      cp: 1.55, cpk: 1.52,
      points: Array.from({ length: 60 }, (_, i) => ({
        val: 120.0 + (Math.random() - 0.5) * 10 + (i === 28 ? 8.5 : 0),
        inControl: i !== 28,
        violation: i === 28 ? 'NELSON_1' : null,
        ts: hoursAgo(60 - i * 0.35),
      })),
    },
    {
      machine: 'INS-01', name: 'Paint Dry Film Thickness', unit: 'microns',
      nominal: 150.0, usl: 200.0, lsl: 125.0, ucl: 185.0, lcl: 130.0, cl: 150.0,
      cp: 1.08, cpk: 1.04,
      points: Array.from({ length: 35 }, (_, i) => ({
        val: 150.0 + (Math.random() - 0.5) * 40,
        inControl: true,
        violation: null,
        ts: hoursAgo(35 - i * 0.6),
      })),
    },
  ];

  for (const sp of spcParams) {
    const machine = machines.find(m => m.code === sp.machine);
    if (!machine) continue;
    const ex = await prisma.processParameter.findFirst({ where: { machineId: machine.id, parameterName: sp.name } });
    if (ex) continue;

    const param = await prisma.processParameter.create({ data: {
      id: uuid(), machineId: machine.id,
      parameterName: sp.name, unit: sp.unit,
      nominalValue: sp.nominal,
      upperSpecLimit: sp.usl, lowerSpecLimit: sp.lsl,
      upperControlLimit: sp.ucl, lowerControlLimit: sp.lcl,
      isActive: true,
    }});

    // Control limit record
    await prisma.controlLimit.create({ data: {
      id: uuid(), parameterId: param.id,
      ucl: sp.ucl, lcl: sp.lcl, centerLine: sp.cl,
      sigma: (sp.ucl - sp.cl) / 3, cp: sp.cp, cpk: sp.cpk,
      sampleCount: sp.points.length,
    }});

    // SPC records
    for (const pt of sp.points) {
      await prisma.sPCRecord.create({ data: {
        id: uuid(), parameterId: param.id,
        value: parseFloat(pt.val.toFixed(4)),
        machineId: machine.id,
        inControl: pt.inControl,
        violationType: pt.violation ?? null,
        measuredAt: pt.ts,
      }});
    }
  }
  console.log(`  Created ${spcParams.length} SPC parameters with measurement history.\n`);

  // ─────────────────────────────────────────────────────────
  // STEP 5 — Machine Recipes
  // ─────────────────────────────────────────────────────────
  console.log('  Seeding machine recipes...');
  const products = await prisma.product.findMany();

  const recipesData = [
    {
      code: 'RCP-CNC-FLANGE-4IN', name: '4" Weld Neck Flange — CNC Program', sku: 'FLANGE-4IN',
      machine: 'CNC-02', status: 'APPROVED', approvedBy: 'Engineering Lead',
      desc: 'CNC machining program for ANSI 300# raised face weld neck flange. Includes roughing and finish passes.',
      params: [
        { name: 'Spindle Speed',    unit: 'RPM',  val: '1200', min: '800',  max: '1500', setpoint: true,  addr: 'DB1.DBW10' },
        { name: 'Feed Rate',        unit: 'mm/min',val: '250',  min: '150',  max: '400',  setpoint: true,  addr: 'DB1.DBW12' },
        { name: 'Depth of Cut',     unit: 'mm',   val: '2.5',  min: '1.0',  max: '4.0',  setpoint: true,  addr: 'DB1.DBW14' },
        { name: 'Coolant Flow',     unit: 'L/min',val: '15',   min: '10',   max: '25',   setpoint: true,  addr: 'DB1.DBW16' },
        { name: 'Surface Finish Ra',unit: 'µm',   val: '1.6',  min: null,   max: '3.2',  setpoint: false, addr: null },
        { name: 'Final Bore Dia',   unit: 'mm',   val: '100.0',min: '99.95',max: '100.05',setpoint: false, addr: null },
      ],
    },
    {
      code: 'RCP-WLD-BUTT-CS', name: 'Carbon Steel Butt Weld — SMAW Process', sku: 'VALVE-6IN',
      machine: 'WLD-01', status: 'APPROVED', approvedBy: 'Welding Engineer',
      desc: 'Shielded Metal Arc Welding procedure for CS pipe butt welds per WPS-CS-001. Includes preheat requirements.',
      params: [
        { name: 'Amperage',         unit: 'A',    val: '130',  min: '110',  max: '155',  setpoint: true,  addr: 'DB2.DBW20' },
        { name: 'Voltage',          unit: 'V',    val: '24',   min: '22',   max: '27',   setpoint: true,  addr: 'DB2.DBW22' },
        { name: 'Travel Speed',     unit: 'mm/min',val: '180',  min: '150',  max: '220',  setpoint: false, addr: null },
        { name: 'Preheat Temp',     unit: '°C',   val: '100',  min: '80',   max: '150',  setpoint: true,  addr: 'DB2.DBW24' },
        { name: 'Interpass Temp',   unit: '°C',   val: '250',  min: null,   max: '300',  setpoint: false, addr: null },
        { name: 'Electrode Size',   unit: 'mm',   val: '3.2',  min: '2.5',  max: '4.0',  setpoint: false, addr: null },
      ],
    },
    {
      code: 'RCP-ASM-VALVE-TORQUE', name: 'Gate Valve Assembly — Torque Spec', sku: 'VALVE-6IN',
      machine: 'ASM-01', status: 'APPROVED', approvedBy: 'Engineering Lead',
      desc: 'Assembly procedure for 6" gate valve. Defines torque values for all bolted connections per API 600.',
      params: [
        { name: 'Body Bolt Torque', unit: 'Nm',   val: '120',  min: '110',  max: '130',  setpoint: true,  addr: 'DB3.DBW30' },
        { name: 'Stem Packing Torq',unit: 'Nm',   val: '45',   min: '40',   max: '55',   setpoint: true,  addr: 'DB3.DBW32' },
        { name: 'Gland Flange Torq',unit: 'Nm',   val: '35',   min: '30',   max: '42',   setpoint: true,  addr: 'DB3.DBW34' },
        { name: 'Test Pressure',    unit: 'bar',  val: '75',   min: '70',   max: '80',   setpoint: false, addr: null },
        { name: 'Seat Leak Rate',   unit: 'cc/min',val: '0.0',  min: null,   max: '1.0',  setpoint: false, addr: null },
      ],
    },
    {
      code: 'RCP-PNT-PRIMER-CS', name: 'Carbon Steel Primer — Epoxy System', sku: 'SPOOL-ASSY',
      machine: 'PNT-01', status: 'DRAFT', approvedBy: null,
      desc: 'Epoxy primer application for carbon steel pipe spools. First coat before topcoat per paint spec PS-001.',
      params: [
        { name: 'Spray Pressure',   unit: 'bar',  val: '3.5',  min: '3.0',  max: '4.5',  setpoint: true,  addr: 'DB4.DBW40' },
        { name: 'Application Temp', unit: '°C',   val: '20',   min: '10',   max: '35',   setpoint: false, addr: null },
        { name: 'DFT Target',       unit: 'µm',   val: '75',   min: '60',   max: '100',  setpoint: false, addr: null },
        { name: 'Cure Time',        unit: 'hours', val: '4',    min: '2',    max: '8',    setpoint: false, addr: null },
      ],
    },
  ];

  for (const r of recipesData) {
    const ex = await prisma.recipe.findUnique({ where: { code: r.code } });
    if (ex) continue;
    const product = products.find(p => p.sku === r.sku);
    if (!product) continue;

    const recipe = await prisma.recipe.create({ data: {
      id: uuid(), code: r.code, name: r.name,
      productId: product.id, version: 1, status: r.status,
      description: r.desc, approvedBy: r.approvedBy,
      approvedAt: r.approvedBy ? daysAgo(rand(5, 30)) : null,
      createdAt: daysAgo(rand(30, 90)), createdBy: 'Engineering Lead',
    }});

    for (let i = 0; i < r.params.length; i++) {
      const p = r.params[i];
      await prisma.recipeParameter.create({ data: {
        id: uuid(), recipeId: recipe.id,
        parameterName: p.name, unit: p.unit,
        nominalValue: p.val, minValue: p.min, maxValue: p.max,
        isSetpoint: p.setpoint, plcAddress: p.addr, sequence: i + 1,
      }});
    }
  }
  console.log(`  Created ${recipesData.length} machine recipes.\n`);

  // ─────────────────────────────────────────────────────────
  // STEP 6 — Lots, Batches, Serial Numbers, Traceability
  // ─────────────────────────────────────────────────────────
  console.log('  Seeding traceability data...');

  const workOrders = await prisma.workOrder.findMany({ include: { product: true } });
  const completedOrders = workOrders.filter(wo => wo.status === 'COMPLETED');

  const lotsData = [
    { lotNum: 'LOT-CS-A106-001', productSku: 'VALVE-6IN',  supplier: 'SteelMax Supply', qty: 500, unit: 'kg', status: 'CONSUMED',
      cert: 'MTR-2024-001', expiry: daysFromNow(365) },
    { lotNum: 'LOT-CS-A53-002',  productSku: 'FLANGE-4IN', supplier: 'Metro Steel', qty: 300, unit: 'kg', status: 'IN_USE',
      cert: 'MTR-2024-002', expiry: daysFromNow(365) },
    { lotNum: 'LOT-SS316L-003',  productSku: 'SPOOL-ASSY', supplier: 'Alloy World', qty: 150, unit: 'kg', status: 'AVAILABLE',
      cert: 'MTR-2024-003', expiry: daysFromNow(730) },
    { lotNum: 'LOT-FILLER-E7018', productSku: 'VALVE-6IN', supplier: 'WeldPro Supplies', qty: 50, unit: 'kg', status: 'IN_USE',
      cert: 'MTR-2024-004', expiry: daysFromNow(180) },
  ];

  const lots = {};
  for (const l of lotsData) {
    const ex = await prisma.lot.findUnique({ where: { lotNumber: l.lotNum } });
    if (ex) { lots[l.lotNum] = ex; continue; }
    const product = products.find(p => p.sku === l.productSku);
    if (!product) continue;
    const lot = await prisma.lot.create({ data: {
      id: uuid(), lotNumber: l.lotNum, productId: product.id,
      supplierId: l.supplier, receivedAt: daysAgo(rand(20, 60)),
      quantity: l.qty, unit: l.unit, status: l.status,
      certificateOfConformance: l.cert, expiryDate: l.expiry,
    }});
    lots[l.lotNum] = lot;
  }

  // Batches and serial numbers for completed orders
  for (const wo of completedOrders.slice(0, 2)) {
    const ex = await prisma.batch.findFirst({ where: { workOrderId: wo.id } });
    if (ex) continue;
    const lot = Object.values(lots)[0];

    const batch = await prisma.batch.create({ data: {
      id: uuid(), batchNumber: `BATCH-${wo.orderNumber}-B1`,
      workOrderId: wo.id, lotId: lot?.id ?? null,
      quantity: wo.quantity, status: 'COMPLETED',
      startedAt: daysAgo(rand(5, 15)), completedAt: daysAgo(rand(1, 4)),
    }});

    // Serial numbers
    for (let i = 1; i <= Math.min(wo.quantity, 6); i++) {
      const serial = `${wo.product.sku}-${wo.orderNumber}-${i.toString().padStart(3, '0')}`;
      const exS = await prisma.serialNumber.findUnique({ where: { serial } });
      if (exS) continue;
      const sn = await prisma.serialNumber.create({ data: {
        id: uuid(), serial, batchId: batch.id,
        productId: wo.productId, status: 'ACTIVE',
        manufacturedAt: daysAgo(rand(2, 10)),
      }});

      // Traceability records for this serial
      const events = [
        { type: 'MATERIAL_RECEIVED', ts: daysAgo(15), data: { lotNumber: lot?.lotNumber, supplier: 'SteelMax Supply', quantity: 1 } },
        { type: 'PRODUCTION_START',  ts: daysAgo(10), data: { workOrder: wo.orderNumber, operator: 'Ali Hassan', machine: 'CNC-01' } },
        { type: 'OPERATION_COMPLETE',ts: daysAgo(8),  data: { operation: 'Machining', duration: '4.5h', machine: 'CNC-01' } },
        { type: 'QUALITY_CHECK',     ts: daysAgo(7),  data: { result: 'PASS', inspector: 'Sarah Chen', parameter: 'Dimensional', value: '50.02mm' } },
        { type: 'OPERATION_COMPLETE',ts: daysAgo(5),  data: { operation: 'Welding', welder: 'Mike Torres', wps: 'WPS-CS-001' } },
        { type: 'SHIPMENT',          ts: daysAgo(1),  data: { destination: 'Customer Yard', consignment: `CON-${wo.orderNumber}` } },
      ];
      for (const ev of events) {
        await prisma.traceabilityRecord.create({ data: {
          id: uuid(), batchId: batch.id, serialNumberId: sn.id,
          eventType: ev.type, timestamp: ev.ts,
          data: JSON.stringify(ev.data),
          machineId: machines[0]?.id ?? null, operatorId: operatorUser?.id ?? null,
        }});
      }
    }
  }
  console.log('  Created lots, batches, serial numbers and traceability records.\n');

  // ─────────────────────────────────────────────────────────
  // STEP 7 — Shift Schedules + Operator Assignments + Production
  // ─────────────────────────────────────────────────────────
  console.log('  Seeding shift schedules...');
  const plant = await prisma.plant.findFirst();
  const productionLine = await prisma.productionLine.findFirst();
  const shifts = await prisma.shift.findMany({ where: { plantId: plant?.id } });

  if (shifts.length > 0 && plant && productionLine) {
    const shiftDays = [
      // Today
      { shiftCode: 'SHIFT-A', status: 'ACTIVE',    target: 350, dateOffset: 0, actual: 312, good: 305, scrap: 7,  oee: 82.4 },
      { shiftCode: 'SHIFT-B', status: 'PLANNED',   target: 350, dateOffset: 0, actual: 0,   good: 0,   scrap: 0,  oee: null },
      { shiftCode: 'SHIFT-C', status: 'PLANNED',   target: 350, dateOffset: 0, actual: 0,   good: 0,   scrap: 0,  oee: null },
      // Yesterday
      { shiftCode: 'SHIFT-A', status: 'COMPLETED', target: 350, dateOffset: 1, actual: 341, good: 334, scrap: 7,  oee: 85.1 },
      { shiftCode: 'SHIFT-B', status: 'COMPLETED', target: 350, dateOffset: 1, actual: 298, good: 291, scrap: 7,  oee: 78.6 },
      { shiftCode: 'SHIFT-C', status: 'COMPLETED', target: 350, dateOffset: 1, actual: 329, good: 325, scrap: 4,  oee: 83.2 },
      // 2 days ago
      { shiftCode: 'SHIFT-A', status: 'COMPLETED', target: 350, dateOffset: 2, actual: 356, good: 350, scrap: 6,  oee: 87.4 },
      { shiftCode: 'SHIFT-B', status: 'COMPLETED', target: 350, dateOffset: 2, actual: 318, good: 312, scrap: 6,  oee: 80.1 },
    ];

    for (const sd of shiftDays) {
      const shift = shifts.find(s => s.code === sd.shiftCode);
      if (!shift) continue;
      const date = daysAgo(sd.dateOffset);
      date.setHours(0, 0, 0, 0);

      const ex = await prisma.shiftSchedule.findFirst({
        where: { shiftId: shift.id, productionLineId: productionLine.id, date },
      });
      if (ex) continue;

      const schedule = await prisma.shiftSchedule.create({ data: {
        id: uuid(), shiftId: shift.id, productionLineId: productionLine.id,
        date, targetQuantity: sd.target, status: sd.status,
      }});

      // ShiftProduction record
      if (sd.status !== 'PLANNED') {
        await prisma.shiftProduction.create({ data: {
          id: uuid(), scheduleId: schedule.id,
          actualQuantity: sd.actual, goodQuantity: sd.good,
          scrapQuantity: sd.scrap, plannedDowntime: 30,
          unplannedDowntime: sd.oee ? Math.round((1 - sd.oee / 100) * shift.durationHours * 60 * 0.4) : 0,
          oee: sd.oee, availability: sd.oee ? sd.oee * 1.05 : null,
          performance: sd.oee ? sd.oee * 0.98 : null,
          quality: sd.actual > 0 ? (sd.good / sd.actual) * 100 : null,
        }});
      }

      // Assign operators to active/completed shifts
      const operators = users.filter(u => u.role === 'OPERATOR' || u.role === 'SUPERVISOR');
      if (operators.length > 0 && sd.status !== 'PLANNED') {
        for (const op of operators.slice(0, 2)) {
          const clockIn = new Date(date.getTime() + 6 * 3600 * 1000);
          const clockOut = sd.status === 'COMPLETED' ? new Date(date.getTime() + 14 * 3600 * 1000) : null;
          await prisma.operatorShift.create({ data: {
            id: uuid(), userId: op.id, scheduleId: schedule.id,
            role: op.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'PRIMARY_OPERATOR',
            clockIn, clockOut,
          }});
        }
      }
    }
    console.log(`  Created ${shiftDays.length} shift schedules with production data.\n`);
  } else {
    console.log('  No shifts or plant found — skipping shift schedules.\n');
  }

  // ─────────────────────────────────────────────────────────
  // STEP 8 — Machine Events (alarm history for Machine Health page)
  // ─────────────────────────────────────────────────────────
  console.log('  Seeding machine alarm history...');
  const machineEventsData = [
    { code: 'WLD-02', type: 'FAULT',           severity: 'CRITICAL', desc: 'Main contactor K1 overtemperature fault — contactor wear detected', ts: hoursAgo(48) },
    { code: 'PNT-01', type: 'ALARM',           severity: 'WARNING',  desc: 'Spray nozzle clog alarm — pressure drop exceeded 0.8 bar threshold', ts: hoursAgo(36) },
    { code: 'CNC-02', type: 'STATUS_CHANGE',   severity: 'INFO',     desc: 'Spindle vibration exceeded ISO 10816 Zone B limit (4.5 mm/s RMS)', ts: hoursAgo(24) },
    { code: 'CNC-01', type: 'FAULT',           severity: 'WARNING',  desc: 'Tool #4 broken — automatic tool change triggered, standby tool loaded', ts: hoursAgo(22) },
    { code: 'ASM-02', type: 'ALARM',           severity: 'INFO',     desc: 'Conveyor belt tension low — 2.1 kN measured vs 2.5 kN target', ts: hoursAgo(18) },
    { code: 'WLD-01', type: 'STATUS_CHANGE',   severity: 'INFO',     desc: 'Scheduled PM completed — wire feeder rollers replaced, gas regulator calibrated', ts: hoursAgo(12) },
    { code: 'INS-01', type: 'STATUS_CHANGE',   severity: 'INFO',     desc: 'Calibration verified — measurement system passed MSA gauge R&R study', ts: hoursAgo(6) },
    { code: 'PNT-01', type: 'MAINTENANCE_REQUEST', severity: 'CRITICAL', desc: 'Pressure regulator failure predicted — recommend replacement within 48 hours', ts: hoursAgo(3) },
  ];

  for (const ev of machineEventsData) {
    const machine = machines.find(m => m.code === ev.code);
    if (!machine) continue;
    const ex = await prisma.machineEvent.findFirst({ where: { machineId: machine.id, description: ev.desc } });
    if (ex) continue;
    await prisma.machineEvent.create({ data: {
      id: uuid(), machineId: machine.id,
      eventType: ev.type, severity: ev.severity,
      description: ev.desc, timestamp: ev.ts,
      acknowledged: ev.severity === 'INFO',
      acknowledgedBy: ev.severity === 'INFO' ? 'supervisor' : null,
      resolvedAt: ev.type === 'STATUS_CHANGE' ? new Date(ev.ts.getTime() + 30 * 60 * 1000) : null,
    }});
  }
  console.log(`  Created ${machineEventsData.length} machine alarm events.\n`);

  console.log('Demo seed complete!\n');
  console.log('Summary of what was seeded:');
  console.log('  All 8 machines reset to RUNNING — dashboard will show green');
  console.log('  18 audit trail events with real operation context');
  console.log('  8 machine health scores + predictions (WLD-02 HIGH, PNT-01 CRITICAL)');
  console.log('  5 SPC parameters with 35-60 data points and control limits');
  console.log('  4 machine recipes (approved + draft) with full parameters');
  console.log('  Lots, batches, serial numbers and traceability records');
  console.log('  8 shift schedules (today + 2 previous days) with OEE data');
  console.log('  8 machine alarm events for the health page timeline\n');
}

main()
  .catch(e => { console.error('Seed failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
