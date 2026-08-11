import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiResponse';
import { SchedulerService } from '@/lib/services/SchedulerService'
import { requireRole } from '@/lib/api-auth'

// Bulk-assigns machines to every eligible work order in priority/due-date
// order. Previously delegated to a separate engine (SchedulingEngine) that
// wrote to its own table (ScheduledJob) — a second scheduling subsystem that
// had zero rows and zero reachable UI callers, existing only as a duplicate
// of the real, live one below it. SchedulerService.scheduleAll() reimplements
// the batch-assignment capability as a loop over the single canonical,
// already-tested `schedule()` path (capability-aware, capacity-rate-based
// duration, real conflict logging into SchedulingConflict), so this route now
// writes to the one table the rest of the app (the Gantt board, /api/schedule)
// actually reads. `workOrderIds` is optional — omit it to auto-schedule every
// unscheduled PLANNED/RELEASED work order.
export async function POST(request: NextRequest) {
  const authError = await requireRole(request, ['ADMIN', 'PLANNER', 'SUPERVISOR']);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const { workOrderIds } = body;

    if (workOrderIds !== undefined && !Array.isArray(workOrderIds)) {
      return NextResponse.json({ error: 'workOrderIds must be an array when provided' }, { status: 400 })
    }

    const result = await SchedulerService.scheduleAll(workOrderIds);

    return NextResponse.json(result)
  } catch (error) {
        return handleApiError('[POST /api/schedule/optimize]', error);
  }
}
