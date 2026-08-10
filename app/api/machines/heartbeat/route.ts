import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { requireRole } from '@/lib/api-auth';
import { HeartbeatMonitor } from '@/lib/services/HeartbeatMonitor';

// POST /api/machines/heartbeat â€” receive a heartbeat from a machine or edge device
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE']);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { machineId, status, currentCycleTime, idealCycleTime, temperature, alarmCode } = body;

        if (!machineId) return NextResponse.json({ error: 'machineId required' }, { status: 400 });

        await HeartbeatMonitor.receive(machineId, {
            status,
            currentCycleTime,
            idealCycleTime,
            temperature,
            alarmCode,
        });

        return NextResponse.json({ success: true, receivedAt: new Date().toISOString() });
    } catch (error) {
                return handleApiError('[POST /api/machines/heartbeat]', error);
    }
}

// GET /api/machines/heartbeat?threshold=120 â€” list stale machines
export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'MAINTENANCE']);
    if (authError) return authError;

    try {
        const threshold = Math.max(30, parseInt(new URL(req.url).searchParams.get('threshold') ?? '120') || 120);
        const stale = await HeartbeatMonitor.listStale(threshold);
        return NextResponse.json({ threshold, staleCount: stale.length, machines: stale });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to check heartbeat status' }, { status: 500 });
    }
}
