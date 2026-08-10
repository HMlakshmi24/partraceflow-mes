import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { SPCService } from '@/lib/services/SPCService';
import { requireRole } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
    // MEDIUM fix: this GET had no role check at all, unlike every POST
    // action on the same resource. Matched to the broadest role set POST
    // already uses for SPC access.
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'QC', 'QUALITY']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const parameterId = searchParams.get('parameterId');
        const machineId = searchParams.get('machineId');
        // Bug fix: a non-numeric ?points= (or garbage input) made parseInt
        // return NaN, which Prisma's `take: NaN` throws on — surfacing as a
        // generic 500 instead of a clear 400 for a malformed request.
        const pointsRaw = parseInt(searchParams.get('points') ?? '100');
        const points = Number.isFinite(pointsRaw) && pointsRaw > 0 ? pointsRaw : 100;

        if (parameterId) {
            const data = await SPCService.getChartData(parameterId, points);
            return NextResponse.json({ data });
        }

        const where: any = {};
        if (machineId) where.machineId = machineId;

        const [parameters, machines] = await Promise.all([
            prisma.processParameter.findMany({
                where,
                include: {
                    controlLimits: { orderBy: { calculatedAt: 'desc' }, take: 1 },
                    _count: { select: { spcRecords: true } }
                },
                orderBy: { parameterName: 'asc' }
            }),
            prisma.machine.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
        ]);

        const machineMap = Object.fromEntries(machines.map(m => [m.id, m]));
        const enriched = parameters.map(p => ({
            ...p,
            machine: machineMap[p.machineId] ?? { id: p.machineId, name: p.machineId }
        }));

        return NextResponse.json({ parameters: enriched, machines });
    } catch (error) {
                return handleApiError('[GET /api/spc]', error);
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'add_measurement') {
            const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'QC', 'QUALITY']);
            if (authError) return authError;
            const { parameterId, value, machineId, taskId, operatorId } = body;
            if (!parameterId || value === undefined || !machineId) {
                return NextResponse.json({ error: 'parameterId, value, machineId required' }, { status: 400 });
            }
            const record = await SPCService.addMeasurement({ parameterId, value, machineId, taskId, operatorId });
            return NextResponse.json({ success: true, record });
        }

        if (action === 'recalculate') {
            const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'QC', 'QUALITY']);
            if (authError) return authError;
            const { parameterId, sampleCount } = body;
            if (!parameterId) return NextResponse.json({ error: 'parameterId required' }, { status: 400 });
            const limits = await SPCService.recalculateControlLimits(parameterId, sampleCount ?? 50);
            return NextResponse.json({ success: true, limits });
        }

        if (action === 'create_parameter') {
            const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'QC', 'QUALITY']);
            if (authError) return authError;
            const { parameterName, unit, machineId, nominalValue, upperSpecLimit, lowerSpecLimit } = body;
            if (!parameterName || !machineId) return NextResponse.json({ error: 'parameterName and machineId required' }, { status: 400 });

            const param = await prisma.processParameter.create({
                data: { parameterName, unit, machineId, nominalValue, upperSpecLimit, lowerSpecLimit }
            });
            return NextResponse.json({ success: true, param });
        }


        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
                return handleApiError('[POST /api/spc]', error);
    }
}
