import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { AlarmEngine } from '@/lib/services/AlarmEngine';

// GET /api/alarms â€” list alarm events (active by default)
export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE', 'QC', 'QUALITY', 'PLANNER']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const machineId   = searchParams.get('machineId') ?? undefined;
        const activeOnly  = searchParams.get('active') !== 'false'; // default true
        const take        = Math.min(200, parseInt(searchParams.get('take') ?? '50') || 50);

        const alarms = await prisma.alarmEvent.findMany({
            where: {
                ...(machineId ? { machineId } : {}),
                ...(activeOnly ? { endTime: null } : {}),
            },
            include: {
                machine: { select: { id: true, code: true, name: true } },
            },
            orderBy: { startTime: 'desc' },
            take,
        });

        const activeCount = await AlarmEngine.activeCount(machineId);

        return NextResponse.json({ alarms, activeCount });
    } catch (error) {
                return handleApiError('[GET /api/alarms]', error);
    }
}

// PATCH /api/alarms â€” acknowledge an alarm
export async function PATCH(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'MAINTENANCE']);
    if (authError) return authError;

    try {
        const { id, acknowledgedBy } = await req.json();
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        if (!acknowledgedBy) return NextResponse.json({ error: 'acknowledgedBy required' }, { status: 400 });

        await AlarmEngine.acknowledge(id, acknowledgedBy);
        return NextResponse.json({ success: true });
    } catch (error) {
                return handleApiError('[PATCH /api/alarms]', error);
    }
}
