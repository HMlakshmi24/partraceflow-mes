import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { ShiftService } from '@/lib/services/ShiftService';
import { requireRole } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action');
        let plantId = searchParams.get('plantId') ?? 'PLANT-01';
        if (!searchParams.get('plantId')) {
            const firstShift = await prisma.shift.findFirst({ select: { plantId: true } });
            if (firstShift) plantId = firstShift.plantId;
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
                where: { shift: { plantId } },
                include: {
                    shift: true,
                    operatorShifts: { include: { user: true } },
                    shiftProduction: true
                },
                orderBy: { date: 'desc' },
                take: 30
            })
        ]);

        return NextResponse.json({ shifts, schedules });
    } catch (error) {
        console.error('[GET /api/shifts]', error);
        return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
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
            const authError = requireRole(req, ['ADMIN', 'SUPERVISOR']);
            if (authError) return authError;
        } else {
            const authError = requireRole(req, OPERATOR_SHIFT_ROLES);
            if (authError) return authError;
        }

        if (action === 'create_schedule') {
            const { shiftId, date, targetQuantity } = body;
            if (!shiftId || !date) return NextResponse.json({ error: 'shiftId and date required' }, { status: 400 });

            // Find or auto-create a production line for this shift
            const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
            if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });

            let productionLine = await prisma.productionLine.findFirst();
            if (!productionLine) {
                return NextResponse.json({ error: 'No production lines configured' }, { status: 400 });
            }

            const schedule = await prisma.shiftSchedule.create({
                data: {
                    shiftId,
                    productionLineId: productionLine.id,
                    date: new Date(date),
                    targetQuantity: targetQuantity ?? 0,
                    status: 'SCHEDULED'
                },
                include: { shift: true }
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
        console.error('[POST /api/shifts]', error);
        return NextResponse.json({ error: 'Shift action failed' }, { status: 500 });
    }
}
