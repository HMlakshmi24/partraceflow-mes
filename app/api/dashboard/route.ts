import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];
import { OEEEngine } from '@/lib/services/OEEEngine';
import { AlarmEngine } from '@/lib/services/AlarmEngine';
import { DeviceHealthMonitor } from '@/lib/services/DeviceHealthMonitor';
import { KPIEngine } from '@/lib/services/KPIEngine';
import { ConflictEngine } from '@/lib/services/ConflictEngine';
import { SchedulerService, calcAdherence, calcCapacityUtilization } from '@/lib/services/SchedulerService';
import { calcMaterialVariance, calcVariancePct, calcScrapPct } from '@/lib/services/ProductMasterService';

type PeriodKey = 'day' | 'week' | 'shift';

function getRange(period: PeriodKey) {
    const now = new Date();
    if (period === 'week') {
        const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
        return { from, to: now };
    }
    if (period === 'shift') {
        const from = new Date(now.getTime() - 8 * 3600 * 1000);
        return { from, to: now };
    }
    const from = new Date(now.getTime() - 24 * 3600 * 1000);
    return { from, to: now };
}

function bucketLabels(period: PeriodKey, _from: Date, to: Date) {
    const labels: string[] = [];
    if (period === 'week') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(to.getTime() - i * 24 * 3600 * 1000);
            labels.push(days[d.getDay()]);
        }
        return labels;
    }
    if (period === 'shift') {
        for (let i = 7; i >= 0; i--) {
            const d = new Date(to.getTime() - i * 3600 * 1000);
            labels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        return labels;
    }
    // day: 6 buckets of 4 hours
    for (let i = 5; i >= 0; i--) {
        const d = new Date(to.getTime() - i * 4 * 3600 * 1000);
        labels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
    return labels;
}


export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ALL_ROLES);
    if (authError) return authError;

    try {
        const period = (new URL(req.url).searchParams.get('period') ?? 'day') as PeriodKey;
        const { from, to } = getRange(period);

        // Fetch machines with their live runtime rows in one query
        const machines = await prisma.machine.findMany({
            include: { runtime: true },
        });
        const machineStatusMap = new Map(machines.map(m => [m.id, m.status]));
        const runtimeMap = new Map(machines.filter(m => m.runtime).map(m => [m.id, m.runtime!]));

        // Calculate OEE for each machine from real runtime + downtime data
        const oeeResults = await Promise.allSettled(
            machines.map(m => OEEEngine.calculateForPeriod(m.id, from, to).then(oee => ({
                machineId: m.id,
                machineName: m.name,
                ...oee,
                goodQuantity:  runtimeMap.get(m.id)?.goodCount   ?? 0,
                scrapQuantity: runtimeMap.get(m.id)?.rejectCount  ?? 0,
            })))
        );

        const oeeList = oeeResults
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<any>).value);

        const machinesWithRuntime = oeeList.filter(m => {
            const rt = runtimeMap.get(m.machineId);
            return rt && (rt.runtimeSeconds > 0 || rt.goodCount > 0 || rt.cycleCount > 0);
        });
        const n = machinesWithRuntime.length || 1;
        const avgRaw = machinesWithRuntime.reduce((acc, r) => ({
            oee:          acc.oee          + r.oee          / n,
            availability: acc.availability + r.availability / n,
            performance:  acc.performance  + r.performance  / n,
            quality:      acc.quality      + r.quality      / n,
        }), { oee: 0, availability: 0, performance: 0, quality: 0 });
        const avg = {
            oee:          Math.round(avgRaw.oee          * 10) / 10,
            availability: Math.round(avgRaw.availability * 10) / 10,
            performance:  Math.round(avgRaw.performance  * 10) / 10,
            quality:      Math.round(avgRaw.quality      * 10) / 10,
        };

        // â”€â”€ Historical downtime (closed events in period) â€” for Pareto chart â”€â”€â”€â”€â”€â”€
        const downtimeEvents = await prisma.downtimeEvent.findMany({
            where: { startTime: { gte: from, lte: to }, endTime: { not: null } }, // CLOSED only
            include: { reason: true, machine: { select: { id: true, name: true, code: true } } }
        });
        const now = new Date();
        const downtimeMap = new Map<string, number>();
        const machineStopMap = new Map<string, { name: string; count: number; minutes: number }>();
        downtimeEvents.forEach(e => {
            const key = e.reason?.name ?? 'Unknown';
            const minutes = e.durationMinutes ?? (e.endTime ? ((e.endTime.getTime() - e.startTime.getTime()) / 60000) : 0);
            downtimeMap.set(key, (downtimeMap.get(key) ?? 0) + minutes);
            if (e.machineId) {
                const mName = e.machine?.name ?? e.machine?.code ?? e.machineId.slice(0, 8);
                const prev = machineStopMap.get(e.machineId) ?? { name: mName, count: 0, minutes: 0 };
                machineStopMap.set(e.machineId, { name: mName, count: prev.count + 1, minutes: prev.minutes + minutes });
            }
        });
        const downtime = Array.from(downtimeMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([label, value]) => ({ label, value, color: '#d32f2f' }));

        // â”€â”€ Active (open) stops â€” drives live alert state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const openDowntimeEvents = await prisma.downtimeEvent.findMany({
            where: { status: 'OPEN', endTime: null },
            include: { reason: true, machine: { select: { id: true, name: true, code: true } } },
            orderBy: { startTime: 'desc' },
        });
        const activeStopMachines = openDowntimeEvents
            .filter(e => e.machineId)
            .map(e => ({
                id: e.machineId!,
                downtimeEventId: e.id,
                name: e.machine?.name ?? e.machine?.code ?? 'Unknown',
                reason: e.reason?.name ?? 'No reason recorded',
                since: e.startTime.toISOString(),
                durationMins: Math.round((now.getTime() - e.startTime.getTime()) / 60000),
            }));
        // Deduplicate: one entry per machine (most recent stop)
        const seenMachines = new Set<string>();
        const activeDown = activeStopMachines.filter(m => {
            if (seenMachines.has(m.id)) return false;
            seenMachines.add(m.id);
            return true;
        });

        const qc = await prisma.qualityCheck.findMany({
            where: { result: 'FAIL' },
            take: 200,
            orderBy: { id: 'desc' }
        });
        const scrapMap = new Map<string, number>();
        qc.forEach(q => {
            const key = q.parameter ?? 'Defect';
            scrapMap.set(key, (scrapMap.get(key) ?? 0) + 1);
        });
        const scrap = Array.from(scrapMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([label, value]) => ({ label, value, color: '#ff5722' }));

        const andonAlerts = await prisma.andonEvent.findMany({
            where: { resolvedAt: null },
            include: { board: true },
            orderBy: { timestamp: 'desc' },
            take: 5,
        });

        const [openDowntimes, activeOrders, failedQc, activeAlarms, deviceCounts] = await Promise.all([
            prisma.downtimeEvent.count({ where: { status: 'OPEN' } }),
            prisma.workOrder.count({ where: { status: { in: ['RELEASED', 'IN_PROGRESS'] } } }),
            prisma.qualityCheck.count({ where: { result: 'FAIL' } }),
            AlarmEngine.activeCount(),
            DeviceHealthMonitor.statusCounts(),
        ]);

        // â”€â”€ Analytics: fleet KPIs for the selected period â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const machineIdsWithRuntime = machines
            .filter(m => m.runtime && (m.runtime.runtimeSeconds > 0 || m.runtime.goodCount > 0))
            .map(m => m.id);
        const fleetKpi = machineIdsWithRuntime.length > 0
            ? await KPIEngine.aggregateFleet(machineIdsWithRuntime, from, to)
            : { avgMTBF: 0, avgMTTR: 0, avgUtilization: 0, avgScrapRate: 0 };

        // Alarm trend: count per day for the period
        const alarmTrendRaw = await prisma.alarmEvent.findMany({
            where: { startTime: { gte: from, lte: to } },
            select: { startTime: true, severity: true },
        });
        const alarmTrendBucketMs = period === 'week' ? 86_400_000 : period === 'shift' ? 3_600_000 : 4 * 3_600_000;
        const alarmTrendMap = new Map<number, number>();
        for (const a of alarmTrendRaw) {
            const bucket = Math.floor(a.startTime.getTime() / alarmTrendBucketMs) * alarmTrendBucketMs;
            alarmTrendMap.set(bucket, (alarmTrendMap.get(bucket) ?? 0) + 1);
        }
        const alarmTrend = Array.from(alarmTrendMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([ts, count]) => ({ timestamp: new Date(ts), count }));

        const runningMachines = machines.filter(m => (m.status ?? '').toUpperCase() === 'RUNNING').length;

        const tasks = await prisma.workflowTask.findMany({
            where: { status: 'COMPLETED', endTime: { gte: from, lte: to } },
            select: { endTime: true }
        });

        const labels = bucketLabels(period, from, to);
        const production = labels.map(label => ({ hour: label, actual: 0, target: 0 }));
        const bucketMs = period === 'week' ? 24 * 3600 * 1000 : period === 'shift' ? 3600 * 1000 : 4 * 3600 * 1000;
        const start = period === 'week' ? new Date(to.getTime() - 6 * 24 * 3600 * 1000) :
            period === 'shift' ? new Date(to.getTime() - 7 * 3600 * 1000) :
                new Date(to.getTime() - 5 * 4 * 3600 * 1000);

        tasks.forEach(t => {
            if (!t.endTime) return;
            const idx = Math.floor((t.endTime.getTime() - start.getTime()) / bucketMs);
            if (idx >= 0 && idx < production.length) {
                production[idx].actual += 1;
            }
        });

        production.forEach(p => {
            p.target = p.actual > 0 ? Math.max(p.actual, Math.round(p.actual * 1.15)) : 0;
        });

        const machineRows = oeeList.map((m: any) => {
            const dbStatus = (machineStatusMap.get(m.machineId) ?? 'IDLE').toLowerCase();
            const rt = runtimeMap.get(m.machineId);
            const status = dbStatus === 'running'
                ? 'running'
                : dbStatus === 'maintenance'
                    ? 'warning'
                    : dbStatus === 'down'
                        ? 'down'
                        : 'stopped';
            return {
                id:            m.machineId,
                name:          m.machineName,
                oee:           Math.round(m.oee * 10) / 10,
                availability:  Math.round(m.availability * 10) / 10,
                performance:   Math.round(m.performance * 10) / 10,
                quality:       Math.round(m.quality * 10) / 10,
                goodQuantity:  rt?.goodCount   ?? 0,
                scrapQuantity: rt?.rejectCount  ?? 0,
                runtimeSeconds:  rt?.runtimeSeconds   ?? 0,
                downtimeSeconds: rt?.downtimeSeconds  ?? 0,
                lastHeartbeat:   rt?.lastHeartbeat?.toISOString() ?? null,
                status,
            };
        });

        const stopsByMachine = Array.from(machineStopMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 6)
            .map(([id, v]) => ({ id, name: v.name, count: v.count, minutes: Math.round(v.minutes) }));

        // Mark machines currently down based on real open stops only
        const downMachineIds = new Set(activeDown.map(m => m.id));
        machineRows.forEach(m => {
            if (downMachineIds.has(m.id)) m.status = 'down';
        });

        const finalRunningMachines = machineRows.filter(m => m.status === 'running').length;

        // â”€â”€ Planning analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const planningHorizonEnd = new Date(to.getTime() + 24 * 3_600_000); // next 24h beyond period

        const [blockingConflicts, upcomingSchedules, delayedOrders] = await Promise.all([
            ConflictEngine.countActive(),
            prisma.productionSchedule.findMany({
                where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, plannedStart: { lte: planningHorizonEnd } },
                select: { machineId: true, plannedStart: true, plannedEnd: true, estimatedDurationMinutes: true },
            }),
            prisma.workOrder.count({
                where: { status: { in: ['RELEASED', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } },
            }),
        ]);

        // Machine utilization forecast: scheduled minutes / available minutes per machine (next 24h)
        const forecastMs = 24 * 3_600_000;
        const forecastEnd = new Date(Date.now() + forecastMs);
        const schedLoadByMachine = new Map<string, number>();
        for (const s of upcomingSchedules) {
            const clippedStart = Math.max(s.plannedStart.getTime(), Date.now());
            const clippedEnd   = Math.min(s.plannedEnd.getTime(), forecastEnd.getTime());
            const mins = Math.max(0, clippedEnd - clippedStart) / 60_000;
            schedLoadByMachine.set(s.machineId, (schedLoadByMachine.get(s.machineId) ?? 0) + mins);
        }
        const availableMinutes = forecastMs / 60_000; // 1440 min per machine per day
        const machineUtilizationForecast = machines.map(m => ({
            machineId:   m.id,
            machineName: m.name,
            scheduledMinutes: Math.round(schedLoadByMachine.get(m.id) ?? 0),
            availableMinutes: Math.round(availableMinutes),
            utilizationPct: calcCapacityUtilization(schedLoadByMachine.get(m.id) ?? 0, availableMinutes),
        }));

        // Schedule adherence: avg across recently COMPLETED schedules in period
        const completedSchedules = await prisma.productionSchedule.findMany({
            where: { status: 'COMPLETED', actualEnd: { gte: from, lte: to } },
            select: { estimatedDurationMinutes: true, actualStart: true, actualEnd: true },
        });
        const adherenceValues = completedSchedules
            .filter(s => s.actualStart && s.actualEnd)
            .map(s => {
                const actual = (s.actualEnd!.getTime() - s.actualStart!.getTime()) / 60_000;
                return calcAdherence(s.estimatedDurationMinutes, actual);
            });
        const scheduleAdherence = adherenceValues.length > 0
            ? Math.round(adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length * 10) / 10
            : null;

        // â”€â”€ Manufacturing analytics (Product / BOM / Routing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const [topProductRows, consumptionRows, routingBottleneckRows, overdueOpsCount] = await Promise.all([
            // Top running products by active work order count
            prisma.workOrder.groupBy({
                by: ['productId'],
                where: { status: { in: ['RELEASED', 'IN_PROGRESS'] } },
                _count: { id: true },
                orderBy: { _count: { id: 'desc' } },
                take: 5,
            }),
            // Material consumption variance for the period
            prisma.materialConsumption.findMany({
                where: { issuedAt: { gte: from, lte: to } },
                select: { componentCode: true, plannedQuantity: true, actualQuantity: true, scrapQuantity: true },
            }),
            // Routing bottlenecks: operations with highest estimated cycle time
            prisma.routingOperation.findMany({
                where: { routing: { isActive: true } },
                orderBy: { estimatedCycleTime: 'desc' },
                take: 5,
                select: {
                    operationCode: true, operationName: true,
                    machineCapabilityType: true, estimatedCycleTime: true, sequence: true,
                    routing: { select: { routingCode: true, product: { select: { sku: true, name: true } } } },
                },
            }),
            // Overdue operations: released/in-progress orders past due date
            prisma.workOrder.count({
                where: { status: { in: ['RELEASED', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } },
            }),
        ]);

        // Resolve product names for top products
        const topProductIds = topProductRows.map(r => r.productId);
        const topProductDetails = topProductIds.length > 0
            ? await prisma.product.findMany({
                where: { id: { in: topProductIds } },
                select: { id: true, sku: true, name: true },
            })
            : [];
        const topProductMap = new Map(topProductDetails.map(p => [p.id, p]));

        const topProducts = topProductRows.map(r => ({
            productId:   r.productId,
            sku:         topProductMap.get(r.productId)?.sku ?? r.productId,
            name:        topProductMap.get(r.productId)?.name ?? 'Unknown',
            activeOrders: r._count.id,
        }));

        // Aggregate material variance by component
        const componentVarianceMap = new Map<string, { planned: number; actual: number; scrap: number }>();
        for (const c of consumptionRows) {
            const prev = componentVarianceMap.get(c.componentCode) ?? { planned: 0, actual: 0, scrap: 0 };
            componentVarianceMap.set(c.componentCode, {
                planned: prev.planned + c.plannedQuantity,
                actual:  prev.actual  + c.actualQuantity,
                scrap:   prev.scrap   + c.scrapQuantity,
            });
        }
        const materialVariance = Array.from(componentVarianceMap.entries())
            .map(([code, v]) => ({
                componentCode: code,
                plannedQty:    Math.round(v.planned * 100) / 100,
                actualQty:     Math.round(v.actual  * 100) / 100,
                scrapQty:      Math.round(v.scrap   * 100) / 100,
                variance:      calcMaterialVariance(v.planned, v.actual),
                variancePct:   calcVariancePct(v.planned, v.actual),
                scrapPct:      calcScrapPct(v.scrap, v.actual),
            }))
            .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
            .slice(0, 10);

        // Scrap by product (from machine runtime rejectCount, per active order product)
        const scrapByProduct = topProducts.map(p => {
            const woMachineIds = machines.map(m => m.id);
            const totalReject = woMachineIds.reduce((sum, mid) => sum + (runtimeMap.get(mid)?.rejectCount ?? 0), 0);
            return { ...p, scrapRate: totalReject };
        });

        // Downtime heatmap: runtime vs downtime per machine â€” built after machineRows is finalised
        const downtimeHeatmap = machineRows.map(m => ({
            machineId:       m.id,
            machineName:     m.name,
            downtimeMinutes: Math.round((m.downtimeSeconds ?? 0) / 60),
            utilization:     (m.runtimeSeconds > 0 || m.downtimeSeconds > 0)
                ? Math.round((m.runtimeSeconds / (m.runtimeSeconds + m.downtimeSeconds)) * 1000) / 10
                : 0,
        }));

        return NextResponse.json({
            oee: { ...avg, stops: activeDown.length },   // stops = LIVE open count
            stopsByMachine,
            machines: machineRows,
            activeDown,                                  // currently down with reason + duration
            downtime,
            scrap,
            production,
            summary: {
                activeOrders,
                openDowntimes,
                failedQc,
                activeAlarms,
                runningMachines: finalRunningMachines,
                totalMachines: machines.length,
            },
            connectivity: {
                connectedDevices:   deviceCounts.online,
                offlineDevices:     deviceCounts.offline,
                errorDevices:       deviceCounts.error,
                activePlcAlarms:    activeAlarms,
            },
            analytics: {
                mtbf:               fleetKpi.avgMTBF,
                mttr:               fleetKpi.avgMTTR,
                utilization:        fleetKpi.avgUtilization,
                scrapRate:          fleetKpi.avgScrapRate,
                alarmTrend,
                downtimeHeatmap,
            },
            planning: {
                blockingConflicts,
                delayedOrders,
                scheduleAdherence,
                machineUtilizationForecast,
            },
            manufacturing: {
                topProducts,
                materialVariance,
                routingBottlenecks: routingBottleneckRows.map(op => ({
                    operationCode:         op.operationCode,
                    operationName:         op.operationName,
                    machineCapabilityType: op.machineCapabilityType,
                    estimatedCycleTime:    op.estimatedCycleTime,
                    routingCode:           op.routing.routingCode,
                    productSku:            op.routing.product.sku,
                    productName:           op.routing.product.name,
                })),
                overdueOperations: overdueOpsCount,
                scrapByProduct,
            },
            andon: {
                activeCount: andonAlerts.length,
                criticalCount: andonAlerts.filter(a => a.severity === 'CRITICAL').length,
                alerts: andonAlerts.map(a => ({
                    id: a.id,
                    color: a.color,
                    message: a.message,
                    severity: a.severity,
                    reason: a.reason,
                    boardName: a.board?.name ?? 'Andon',
                    timestamp: a.timestamp,
                    machineId: a.machineId ?? null,
                }))
            }
        });
    } catch (error) {
                return handleApiError('[GET /api/dashboard]', error);
    }
}
