import { prisma } from '@/lib/services/database';

interface DateRange { from: Date; to: Date }

export async function fetchShiftReport(opts: DateRange & { productionLineId?: string }) {
  const where: any = { date: { gte: opts.from, lte: opts.to } };
  if (opts.productionLineId) where.productionLineId = opts.productionLineId;

  const schedules = await prisma.shiftSchedule.findMany({
    where,
    include: { shift: true, shiftProduction: true, productionLine: true },
    orderBy: { date: 'desc' },
  });
  const rows = schedules.map(s => ({
    date: s.date, lineName: s.productionLine.name,
    shiftName: s.shift?.name ?? 'Unknown',
    target: s.targetQuantity,
    actual: s.shiftProduction?.actualQuantity ?? 0,
    good: s.shiftProduction?.goodQuantity ?? 0,
    scrap: s.shiftProduction?.scrapQuantity ?? 0,
    oee: s.shiftProduction?.oee ?? null,
  }));
  return { rows, shifts: rows };
}

export async function fetchOEEReport(opts: DateRange & { machineId?: string }) {
  const where: any = { periodStart: { gte: opts.from }, periodEnd: { lte: opts.to } };
  if (opts.machineId) where.machineId = opts.machineId;

  const snapshots = await prisma.oEESnapshot.findMany({
    where,
    include: { machine: { select: { name: true, code: true } } },
    orderBy: { periodStart: 'desc' },
  });
  const machines = snapshots.map(s => ({
    machine: s.machine.name, code: s.machine.code,
    oee: s.oee, availability: s.availability, performance: s.performance, quality: s.quality,
    periodStart: s.periodStart, periodEnd: s.periodEnd,
    goodCount: s.goodCount, rejectCount: s.rejectCount,
  }));
  return { machines, snapshots: machines };
}

export async function fetchDowntimeReport(opts: DateRange & { machineId?: string }) {
  const where: any = { startTime: { gte: opts.from, lte: opts.to } };
  if (opts.machineId) where.machineId = opts.machineId;

  const events = await prisma.downtimeEvent.findMany({
    where,
    include: { machine: { select: { name: true, code: true } }, reason: true },
    orderBy: { startTime: 'desc' },
  });
  return {
    events: events.map(e => ({
      machine: e.machine.name, reason: e.reason?.name ?? 'Unknown',
      startTime: e.startTime, endTime: e.endTime,
      durationMinutes: e.durationMinutes ?? 0, status: e.status,
    })),
    summary: {
      totalMinutes: events.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0),
      eventCount: events.length,
    },
  };
}

export async function fetchAlarmReport(opts: DateRange & { machineId?: string; severity?: string }) {
  const where: any = { startTime: { gte: opts.from, lte: opts.to } };
  if (opts.machineId) where.machineId = opts.machineId;
  if (opts.severity) where.severity = opts.severity;

  const alarms = await prisma.alarmEvent.findMany({
    where,
    include: { machine: { select: { name: true, code: true } } },
    orderBy: { startTime: 'desc' },
  });
  return {
    alarms: alarms.map(a => ({
      machine: a.machine.name, code: a.alarmCode, severity: a.severity,
      message: a.message, startTime: a.startTime, endTime: a.endTime,
      acknowledged: a.acknowledged,
    })),
    summary: {
      total: alarms.length,
      bySeverity: {
        critical: alarms.filter(a => a.severity === 'CRITICAL').length,
        high: alarms.filter(a => a.severity === 'HIGH').length,
        medium: alarms.filter(a => a.severity === 'MEDIUM').length,
        low: alarms.filter(a => a.severity === 'LOW').length,
      },
    },
  };
}

export async function fetchTraceabilityReport(opts: { workOrderId?: string; serialNumberId?: string; batchId?: string }) {
  const where: any = {};
  if (opts.batchId) where.batchId = opts.batchId;
  if (opts.serialNumberId) where.serialNumberId = opts.serialNumberId;

  const records = await prisma.traceabilityRecord.findMany({
    where,
    include: {
      batch: { select: { batchNumber: true } },
      serialNumber: { select: { serial: true } },
    },
    orderBy: { timestamp: 'asc' },
    take: 500,
  });
  return { records, chain: records, count: records.length };
}

export async function fetchMDRReport(opts: { mdrId?: string; from?: Date; to?: Date }) {
  const where: any = {};
  if (opts.mdrId) where.id = opts.mdrId;
  if (opts.from && opts.to) where.createdAt = { gte: opts.from, lte: opts.to };

  const mdrs = await prisma.mDR.findMany({
    where,
    include: { mdrSpools: { include: { spool: { select: { spoolId: true, status: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return {
    mdrs: mdrs.map(m => ({
      mdrNumber: m.mdrNumber, title: m.title, status: m.status,
      spoolCount: m.mdrSpools.length,
      preparedBy: m.preparedBy, approvedBy: m.approvedBy,
    })),
  };
}

export async function fetchProductionReport(opts: DateRange & { machineId?: string }) {
  const where: any = { createdAt: { gte: opts.from, lte: opts.to } };
  if (opts.machineId) where.machineId = opts.machineId;

  const orders = await prisma.workOrder.findMany({
    where,
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const completed = orders.filter(o => o.status === 'COMPLETED');
  const totalQuantity = orders.reduce((sum, o) => sum + (o.quantity ?? 0), 0);
  const onTimeCounts = completed.filter(o => o.dueDate && o.dueDate >= (o.createdAt));
  const avgOnTimeRate = completed.length > 0 ? Math.round(onTimeCounts.length / completed.length * 100) : null;

  const dailyMap = new Map<string, { completed: number; quantity: number; total: number }>();
  for (const o of orders) {
    const day = o.createdAt.toISOString().split('T')[0];
    const prev = dailyMap.get(day) ?? { completed: 0, quantity: 0, total: 0 };
    prev.total++;
    prev.quantity += o.quantity ?? 0;
    if (o.status === 'COMPLETED') prev.completed++;
    dailyMap.set(day, prev);
  }

  return {
    summary: {
      totalCompleted: completed.length,
      totalQuantity,
      avgOnTimeRate,
      avgCycleTimeHours: null,
      totalOrders: orders.length,
      completionRate: orders.length > 0 ? Math.round(completed.length / orders.length * 100) : 0,
    },
    daily: Array.from(dailyMap.entries()).map(([date, v]) => ({
      date,
      completed: v.completed,
      quantity: v.quantity,
      total: v.total,
      onTimeRate: null,
      avgCycleTimeHours: null,
    })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function fetchOperatorReport(opts: DateRange) {
  const shifts = await prisma.operatorShift.findMany({
    where: { schedule: { date: { gte: opts.from, lte: opts.to } } },
    include: { user: { select: { username: true, displayName: true } }, schedule: { select: { date: true } } },
  });
  return {
    operators: shifts.map(s => ({
      username: s.user.username, displayName: s.user.displayName,
      role: s.role, date: s.schedule.date,
      clockIn: s.clockIn, clockOut: s.clockOut,
    })),
  };
}
