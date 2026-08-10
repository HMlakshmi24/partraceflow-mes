import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { RuntimeEngine } from '@/lib/services/RuntimeEngine';
import { OEEEngine } from '@/lib/services/OEEEngine';

// GET /api/machines/runtime â€” list all runtime rows with latest OEE
export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'PLANNER', 'MAINTENANCE', 'QC', 'QUALITY']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const machineId = searchParams.get('machineId');

        if (machineId) {
            const runtime = await prisma.machineRuntime.findUnique({ where: { machineId } });
            if (!runtime) return NextResponse.json({ error: 'No runtime data for this machine' }, { status: 404 });

            const hoursBack = Math.max(1, parseInt(searchParams.get('hours') ?? '8') || 8);
            const periodEnd   = new Date();
            const periodStart = new Date(periodEnd.getTime() - hoursBack * 3600000);
            const oee = await OEEEngine.calculateForPeriod(machineId, periodStart, periodEnd);

            return NextResponse.json({ runtime, oee });
        }

        const runtimes = await prisma.machineRuntime.findMany({
            include: { machine: { select: { code: true, name: true } } },
            orderBy: { updatedAt: 'desc' },
        });

        return NextResponse.json({ runtimes });
    } catch (error) {
                return handleApiError('[GET /api/machines/runtime]', error);
    }
}

// POST /api/machines/runtime â€” update runtime state
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE']);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { action, machineId, ...data } = body;

        if (!machineId) return NextResponse.json({ error: 'machineId required' }, { status: 400 });

        if (action === 'heartbeat') {
            await RuntimeEngine.upsertHeartbeat(machineId, {
                status:          data.status,
                currentCycleTime: data.currentCycleTime,
                idealCycleTime:  data.idealCycleTime,
                temperature:     data.temperature,
                alarmCode:       data.alarmCode,
            });
            return NextResponse.json({ success: true });
        }

        if (action === 'record_cycle') {
            const { good = 0, reject = 0, cycleTimeSeconds } = data;
            if (typeof cycleTimeSeconds !== 'number' || cycleTimeSeconds <= 0) {
                return NextResponse.json({ error: 'cycleTimeSeconds must be a positive number' }, { status: 400 });
            }
            await RuntimeEngine.recordCycle(machineId, { good, reject, cycleTimeSeconds });
            return NextResponse.json({ success: true });
        }

        if (action === 'transition_status') {
            const { status } = data;
            const validStatuses = ['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE'];
            if (!validStatuses.includes(status)) {
                return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
            }
            await RuntimeEngine.upsertHeartbeat(machineId, { status });
            return NextResponse.json({ success: true });
        }

        if (action === 'snapshot_oee') {
            const periodEnd   = new Date();
            const hoursBack   = Math.max(1, parseInt(data.hours ?? '8') || 8);
            const periodStart = new Date(periodEnd.getTime() - hoursBack * 3600000);
            const result = await OEEEngine.persistSnapshot(machineId, periodStart, periodEnd);
            if (!result) return NextResponse.json({ error: 'No runtime data found for machine' }, { status: 404 });
            return NextResponse.json({ success: true, oee: result });
        }

        return NextResponse.json({ error: 'Invalid action. Use: heartbeat, record_cycle, transition_status, snapshot_oee' }, { status: 400 });
    } catch (error) {
                return handleApiError('[POST /api/machines/runtime]', error);
    }
}
