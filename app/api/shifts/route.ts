import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { ShiftService } from '@/lib/services/ShiftService';
import { requireRole } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action');
        let plantId = searchParams.get('plantId') ?? '';
        if (!searchParams.get('plantId')) {
            const firstShift = await prisma.shift.findFirst({ select: { plantId: true } });
            if (firstShift) plantId = firstShift.plantId;
        }
        if (!plantId) {
            return NextResponse.json({ success: true, message: 'No shifts configured', shifts: [], schedules: [] });
        }

        if (action === 'current') {
            const current = await ShiftService.getCurrentShift(plantId);
            return NextResponse.json({ current });
        }

        if (action === 'history') {
            const days = parseInt(searchParams.get('days') ?? '7');
            const history = await ShiftService.getShiftOEEHistory(plantId, days);
            return NextResponse.json({ history });
        }

        // Default: list shifts + schedules
        const [shifts, schedules] = await Promise.all([
            prisma.shift.findMany({ where: { plantId }, orderBy: { startTime: 'asc' } }),
            prisma.shiftSchedule.findMany({
                where: {
                    OR: [
                        { shift: { plantId } },
                        { templateId: { not: null } },
                    ],
                },
                include: {
                    shift: true,
                    template: true,
                    operatorShifts: { include: { user: true } },
                    shiftProduction: true,
                },
                orderBy: { date: 'desc' },
                take: 30,
            })
        ]);

        return NextResponse.json({ shifts, schedules });
    } catch (error) {
                return handleApiError('[GET /api/shifts]', error);
    }
}

const SUPERVISOR_ACTIONS = ['create_schedule', 'start_shift', 'close_shift'];
const OPERATOR_SHIFT_ROLES = ['ADMIN', 'SUPERVISOR', 'OPERATOR'];

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        // Scheduling and shift control require ADMIN/SUPERVISOR; clock-in/out also allow OPERATOR
        if (SUPERVISOR_ACTIONS.includes(action)) {
            const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
            if (authError) return authError;
        } else {
            const authError = await requireRole(req, OPERATOR_SHIFT_ROLES);
            if (authError) return authError;
        }

        if (action === 'create_schedule') {
            const { templateId, shiftId, date, targetQuantity, productionLineId } = body;
            if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
            if (!templateId && !shiftId) return NextResponse.json({ error: 'templateId or shiftId required' }, { status: 400 });

            // Bug fix (found via audit): this used to call
            // prisma.productionLine.findFirst() with no filter — neither
            // Shift nor ShiftTemplate has a relation to ProductionLine, so
            // there was no way to derive the "right" one. In a plant with
            // more than one production line (which the ISA-95 hierarchy
            // this app models explicitly supports), every schedule silently
            // landed on whichever line Prisma happened to return first,
            // mis-tracking production for every other line. Now: an
            // explicit productionLineId is honored if given; with exactly
            // one line configured the old single-line-plant behavior still
            // works (there's only one correct answer); with more than one
            // and no productionLineId, this fails loudly instead of
            // guessing wrong silently.
            let productionLine;
            if (productionLineId) {
                productionLine = await prisma.productionLine.findUnique({ where: { id: productionLineId } });
                if (!productionLine) {
                    return NextResponse.json({ error: 'Production line not found' }, { status: 404 });
                }
            } else {
                const lines = await prisma.productionLine.findMany({ take: 2 });
                if (lines.length === 0) {
                    return NextResponse.json({ error: 'No production lines configured' }, { status: 400 });
                }
                if (lines.length > 1) {
                    return NextResponse.json(
                        { error: 'Multiple production lines exist — productionLineId is required to disambiguate which line this schedule is for.' },
                        { status: 400 },
                    );
                }
                productionLine = lines[0];
            }

            let resolvedTarget = targetQuantity ?? 0;

            if (templateId) {
                const template = await prisma.shiftTemplate.findUnique({ where: { id: templateId } });
                if (!template) return NextResponse.json({ error: 'Shift template not found' }, { status: 404 });
                if (!template.isActive) return NextResponse.json({ error: 'Shift template is inactive' }, { status: 400 });
                if (resolvedTarget === 0 && template.targetQuantity) resolvedTarget = template.targetQuantity;

                const scheduledDate = new Date(date);
                const dayStart = new Date(scheduledDate);
                dayStart.setUTCHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart.getTime() + 86400000);
                const duplicate = await prisma.shiftSchedule.findFirst({
                    where: { templateId, date: { gte: dayStart, lt: dayEnd } },
                });
                if (duplicate) {
                    return NextResponse.json(
                        { error: `A schedule for template "${template.name}" on ${scheduledDate.toISOString().slice(0, 10)} already exists` },
                        { status: 409 },
                    );
                }

                const schedule = await prisma.shiftSchedule.create({
                    data: {
                        templateId,
                        productionLineId: productionLine.id,
                        date: new Date(date),
                        targetQuantity: resolvedTarget,
                        status: 'SCHEDULED',
                    },
                    include: { template: true },
                });
                return NextResponse.json({ success: true, schedule });
            }

            // Legacy path: shiftId from Shift model
            const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
            if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });

            const schedule = await prisma.shiftSchedule.create({
                data: {
                    shiftId,
                    productionLineId: productionLine.id,
                    date: new Date(date),
                    targetQuantity: resolvedTarget,
                    status: 'SCHEDULED',
                },
                include: { shift: true },
            });
            return NextResponse.json({ success: true, schedule });
        }

        if (action === 'start_shift') {
            const { scheduleId } = body;
            if (!scheduleId) return NextResponse.json({ error: 'scheduleId required' }, { status: 400 });
            await ShiftService.startShift(scheduleId);
            return NextResponse.json({ success: true });
        }

        if (action === 'close_shift') {
            const { scheduleId } = body;
            if (!scheduleId) return NextResponse.json({ error: 'scheduleId required' }, { status: 400 });
            await ShiftService.closeShift(scheduleId);
            return NextResponse.json({ success: true });
        }

        if (action === 'clock_in') {
            const { scheduleId, userId } = body;
            if (!scheduleId || !userId) return NextResponse.json({ error: 'scheduleId and userId required' }, { status: 400 });

            const existing = await prisma.operatorShift.findFirst({
                where: { scheduleId, userId, clockOut: null }
            });
            if (existing) return NextResponse.json({ error: 'Already clocked in' }, { status: 409 });

            const record = await prisma.operatorShift.create({
                data: {
                    scheduleId,
                    userId,
                    role: body.role ?? 'PRIMARY_OPERATOR',
                    clockIn: new Date()
                }
            });
            return NextResponse.json({ success: true, record });
        }

        if (action === 'clock_out') {
            const { scheduleId, userId } = body;
            if (!scheduleId || !userId) return NextResponse.json({ error: 'scheduleId and userId required' }, { status: 400 });

            const record = await prisma.operatorShift.updateMany({
                where: { scheduleId, userId, clockOut: null },
                data: { clockOut: new Date() }
            });
            return NextResponse.json({ success: true, updated: record.count });
        }

        if (action === 'update_production') {
            const { scheduleId, goodQuantity, scrapQuantity, unplannedDowntime } = body;
            if (!scheduleId) return NextResponse.json({ error: 'scheduleId required' }, { status: 400 });
            await ShiftService.updateProduction(scheduleId, { goodQuantity, scrapQuantity, unplannedDowntime });
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
                return handleApiError('[POST /api/shifts]', error);
    }
}
