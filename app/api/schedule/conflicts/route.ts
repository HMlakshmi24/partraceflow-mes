import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { requireRole } from '@/lib/api-auth';
import { ConflictEngine } from '@/lib/services/ConflictEngine';
import { prisma } from '@/lib/services/database';

// GET /api/schedule/conflicts
export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'MAINTENANCE']);
    if (authError) return authError;

    const sp          = new URL(req.url).searchParams;
    const machineId   = sp.get('machineId')   ?? undefined;
    const workOrderId = sp.get('workOrderId') ?? undefined;
    const activeOnly  = sp.get('active') !== 'false';

    try {
        const conflicts = await prisma.schedulingConflict.findMany({
            where: {
                ...(machineId   ? { machineId }   : {}),
                ...(workOrderId ? { workOrderId }  : {}),
                ...(activeOnly  ? { resolvedAt: null } : {}),
            },
            include: {
                machine:   { select: { id: true, code: true, name: true } },
                workOrder: { select: { id: true, orderNumber: true, status: true } },
            },
            orderBy: { detectedAt: 'desc' },
            take: 200,
        });
        const blocking = await ConflictEngine.countActive();
        return NextResponse.json({ conflicts, blockingCount: blocking });
    } catch (err) {
                return handleApiError('[GET /api/schedule/conflicts]', err);
    }
}

// PATCH /api/schedule/conflicts â€” resolve a conflict by id
export async function PATCH(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        await ConflictEngine.resolve(id);
        return NextResponse.json({ success: true });
    } catch (err) {
                return handleApiError('[PATCH /api/schedule/conflicts]', err);
    }
}
