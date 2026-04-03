import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { OEEService } from '@/lib/services/OEEService';

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
    try {
        const period = (new URL(req.url).searchParams.get('period') ?? 'day') as PeriodKey;
        const { from, to } = getRange(period);

        const machines = await prisma.machine.findMany();
        const machineStatusMap = new Map(machines.map(m => [m.id, m.status]));
        const oeeResults = await Promise.allSettled(
            machines.map(m => OEEService.calculateOEE(m.id, from, to))
        );

        const oeeList = oeeResults
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<any>).value);

        const n = oeeList.length || 1;
        const avgRaw = oeeList.reduce((acc, r) => ({
            oee: acc.oee + r.oee / n,
            availability: acc.availability + r.availability / n,
            performance: acc.performance + r.performance / n,
            quality: acc.quality + r.quality / n,
        }), { oee: 0, availability: 0, performance: 0, quality: 0 });
        const avg = {
            oee: Math.round(avgRaw.oee * 10) / 10,
            availability: Math.round(avgRaw.availability * 10) / 10,
            performance: Math.round(avgRaw.performance * 10) / 10,
            quality: Math.round(avgRaw.quality * 10) / 10,
        };

        // ── Historical downtime (closed events in period) — for Pareto chart ──────
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

        // Pad Pareto with demo history so chart has meaningful scale
        const DEMO_DOWNTIME = [
            { label: 'Electrical Fault', value: 62 },
            { label: 'Preventive Maintenance', value: 45 },
            { label: 'Mechanical Breakdown', value: 38 },
            { label: 'Material Shortage', value: 28 },
            { label: 'Setup / Changeover', value: 18 },
            { label: 'Operator Break', value: 12 },
        ];
        const existingDowntimeLabels = new Set(downtime.map(d => d.label));
        for (const demo of DEMO_DOWNTIME) {
            if (downtime.length >= 6) break;
            if (!existingDowntimeLabels.has(demo.label)) {
                downtime.push({ label: demo.label, value: demo.value, color: '#d32f2f' });
            }
        }

        // ── Active (open) stops — drives live alert state ─────────────────────────
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

        const DEMO_SCRAP = [
            { label: 'Surface Finish', value: 14 },
            { label: 'Dimensional OOS', value: 9 },
            { label: 'Label Misaligned', value: 7 },
            { label: 'Assembly Error', value: 5 },
            { label: 'Torque Failure', value: 3 },
            { label: 'Wrong Color', value: 2 },
        ];
        const existingScrapLabels = new Set(scrap.map(s => s.label));
        for (const demo of DEMO_SCRAP) {
            if (scrap.length >= 6) break;
            if (!existingScrapLabels.has(demo.label)) {
                scrap.push({ label: demo.label, value: demo.value, color: '#ff5722' });
            }
        }

        const andonAlerts = await prisma.andonEvent.findMany({
            where: { resolvedAt: null },
            include: { board: true },
            orderBy: { timestamp: 'desc' },
            take: 5,
        });

        const [openDowntimes, activeOrders, failedQc] = await Promise.all([
            prisma.downtimeEvent.count({ where: { status: 'OPEN' } }),
            prisma.workOrder.count({ where: { status: { in: ['RELEASED', 'IN_PROGRESS'] } } }),
            prisma.qualityCheck.count({ where: { result: 'FAIL' } }),
        ]);

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

        const hasRealProduction = production.some(p => p.actual > 0);
        const DEMO_PROD = [42, 178, 312, 341, 298, 356, 329, 347];
        production.forEach((p, i) => {
            if (!hasRealProduction) {
                // No real task completions yet — show demo target with 0 actual so the chart has scale
                p.actual = 0;
                p.target = DEMO_PROD[i % DEMO_PROD.length] ?? 300;
            } else {
                p.target = Math.max(p.actual, Math.round(p.actual * 1.15));
            }
        });

        const machineRows = oeeList.map((m: any) => {
            const dbStatus = (machineStatusMap.get(m.machineId) ?? 'IDLE').toLowerCase();
            const status = dbStatus === 'running' ? 'running' : dbStatus === 'down' ? 'down' : dbStatus === 'maintenance' ? 'warning' : 'stopped';
            return {
                id: m.machineId,
                name: m.machineName,
                oee: Math.round(m.oee),
                availability: Math.round(m.availability),
                performance: Math.round(m.performance),
                quality: Math.round(m.quality),
                goodQuantity: m.goodQuantity,
                scrapQuantity: m.scrapQuantity,
                status,
            };
        });

        const stopsByMachine = Array.from(machineStopMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 6)
            .map(([id, v]) => ({ id, name: v.name, count: v.count, minutes: Math.round(v.minutes) }));

        // Mark machines currently down based on real open stops
        const downMachineIds = new Set(activeDown.map(m => m.id));
        machineRows.forEach(m => {
            if (downMachineIds.has(m.id)) m.status = 'down';
        });

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
                runningMachines,
                totalMachines: machines.length,
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
        console.error('[GET /api/dashboard]', error);
        return NextResponse.json({ error: 'Failed to build dashboard' }, { status: 500 });
    }
}
