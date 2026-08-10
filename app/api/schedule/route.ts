/**
 * GET  /api/schedule â€” list production schedules
 * POST /api/schedule â€” create a new schedule for a work order
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { SchedulerService } from '@/lib/services/SchedulerService';
import { z } from 'zod';

const CreateScheduleSchema = z.object({
    workOrderId: z.string().min(1),
    machineId:   z.string().optional(),
    notBefore:   z.string().datetime({ offset: true }).optional(),
});

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'PLANNER', 'MAINTENANCE']);
    if (authError) return authError;

    const sp        = new URL(req.url).searchParams;
    const machineId = sp.get('machineId') ?? undefined;
    const status    = sp.get('status')    ?? undefined;
    const from      = sp.get('from')      ? new Date(sp.get('from')!) : undefined;
    const to        = sp.get('to')        ? new Date(sp.get('to')!)   : undefined;

    try {
        const schedules = await prisma.productionSchedule.findMany({
            where: {
                ...(machineId ? { machineId }    : {}),
                ...(status    ? { status }        : {}),
                ...(from      ? { plannedStart: { gte: from } } : {}),
                ...(to        ? { plannedEnd:   { lte: to   } } : {}),
            },
            include: {
                workOrder: { select: { id: true, orderNumber: true, quantity: true, status: true, dueDate: true } },
                machine:   { select: { id: true, code: true, name: true, status: true } },
            },
            orderBy: { plannedStart: 'asc' },
            take: 200,
        });
        return NextResponse.json({ schedules });
    } catch (err) {
                return handleApiError('[GET /api/schedule]', err);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    try {
        const body   = await req.json();
        const parsed = CreateScheduleSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const { workOrderId, machineId, notBefore } = parsed.data;
        const result = await SchedulerService.schedule(
            workOrderId,
            machineId,
            notBefore ? new Date(notBefore) : undefined,
        );
        if (!result.success) {
            return NextResponse.json({ error: result.error, conflicts: result.conflicts }, { status: 422 });
        }
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/schedule]', err);
    }
}
