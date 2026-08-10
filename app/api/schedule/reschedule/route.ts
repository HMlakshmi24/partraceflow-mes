/**
 * POST /api/schedule/reschedule
 *
 * body: { action: "machine_down" | "drift", machineId?, scheduleId?, completionPct? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { requireRole } from '@/lib/api-auth';
import { LiveReschedulingService } from '@/lib/services/LiveReschedulingService';
import { z } from 'zod';

const RescheduleSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('machine_down'), machineId: z.string().min(1) }),
    z.object({ action: z.literal('drift'), scheduleId: z.string().min(1), completionPct: z.number().min(0).max(100) }),
    z.object({ action: z.literal('recalculate'), machineId: z.string().min(1), from: z.string().datetime({ offset: true }).optional() }),
]);

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER']);
    if (authError) return authError;

    try {
        const body   = await req.json();
        const parsed = RescheduleSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        const data = parsed.data;

        if (data.action === 'machine_down') {
            const result = await LiveReschedulingService.handleMachineDown(data.machineId);
            return NextResponse.json(result);
        }

        if (data.action === 'drift') {
            const result = await LiveReschedulingService.handleDrift(data.scheduleId, data.completionPct);
            return NextResponse.json(result);
        }

        if (data.action === 'recalculate') {
            const from    = data.from ? new Date(data.from) : new Date();
            const updated = await LiveReschedulingService.recalculateDownstream(data.machineId, from);
            return NextResponse.json({ machineId: data.machineId, updatedSchedules: updated });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
                return handleApiError('[POST /api/schedule/reschedule]', err);
    }
}
