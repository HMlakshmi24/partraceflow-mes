import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const UpdateScheduleSchema = z.object({
    status:       z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DRIFTED']).optional(),
    actualStart:  z.string().datetime({ offset: true }).nullable().optional(),
    actualEnd:    z.string().datetime({ offset: true }).nullable().optional(),
    driftMinutes: z.number().optional(),
    notes:        z.string().nullable().optional(),
    // Drag/drop rescheduling
    plannedStart: z.string().datetime({ offset: true }).optional(),
    plannedEnd:   z.string().datetime({ offset: true }).optional(),
    machineId:    z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'PLANNER', 'MAINTENANCE']);
    if (authError) return authError;

    const { id } = await params;
    const schedule = await prisma.productionSchedule.findUnique({
        where: { id },
        include: {
            workOrder: true,
            machine:   { select: { id: true, code: true, name: true, status: true } },
        },
    });
    if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    return NextResponse.json(schedule);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const body   = await req.json();
        const parsed = UpdateScheduleSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const { actualStart, actualEnd, plannedStart, plannedEnd, machineId, ...rest } = parsed.data;

        // Validate drag/drop rescheduling constraints
        if (plannedStart !== undefined || plannedEnd !== undefined || machineId !== undefined) {
            const current = await prisma.productionSchedule.findUnique({
                where: { id },
                select: { status: true, machineId: true, plannedStart: true, plannedEnd: true, estimatedDurationMinutes: true },
            });
            if (!current) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });

            if (current.status === 'IN_PROGRESS' || current.status === 'COMPLETED') {
                return NextResponse.json(
                    { error: 'Cannot reschedule a schedule that is IN_PROGRESS or COMPLETED' },
                    { status: 409 },
                );
            }

            const newStart    = plannedStart ? new Date(plannedStart) : current.plannedStart;
            const newEnd      = plannedEnd   ? new Date(plannedEnd)   : current.plannedEnd;
            const targetMachineId = machineId ?? current.machineId;

            if (newEnd.getTime() <= newStart.getTime()) {
                return NextResponse.json({ error: 'plannedEnd must be after plannedStart' }, { status: 400 });
            }

            // Check for overlaps on the target machine (excluding this schedule)
            const overlapping = await prisma.productionSchedule.findFirst({
                where: {
                    id:        { not: id },
                    machineId: targetMachineId,
                    status:    { not: 'CANCELLED' },
                    plannedStart: { lt: newEnd },
                    plannedEnd:   { gt: newStart },
                },
                select: { id: true, workOrder: { select: { orderNumber: true } } },
            });
            if (overlapping) {
                return NextResponse.json(
                    { error: `Overlaps existing schedule for order ${overlapping.workOrder?.orderNumber ?? overlapping.id}` },
                    { status: 409 },
                );
            }
        }

        const schedule = await prisma.productionSchedule.update({
            where: { id },
            data: {
                ...rest,
                ...(actualStart  !== undefined ? { actualStart:  actualStart  ? new Date(actualStart)  : null } : {}),
                ...(actualEnd    !== undefined ? { actualEnd:    actualEnd    ? new Date(actualEnd)    : null } : {}),
                ...(plannedStart !== undefined ? { plannedStart: new Date(plannedStart) } : {}),
                ...(plannedEnd   !== undefined ? { plannedEnd:   new Date(plannedEnd)   } : {}),
                ...(machineId    !== undefined ? { machineId }                            : {}),
            },
        });
        return NextResponse.json(schedule);
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
                return handleApiError('[PUT /api/schedule/[id]]', err);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const s = await prisma.productionSchedule.findUnique({ where: { id }, select: { status: true } });
        if (!s) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        if (s.status === 'IN_PROGRESS') {
            return NextResponse.json({ error: 'Cannot delete an IN_PROGRESS schedule' }, { status: 409 });
        }
        await prisma.productionSchedule.update({ where: { id }, data: { status: 'CANCELLED' } });
        return NextResponse.json({ success: true });
    } catch (err) {
                return handleApiError('[DELETE /api/schedule/[id]]', err);
    }
}
