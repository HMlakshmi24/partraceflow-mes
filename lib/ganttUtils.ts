/**
 * Pure utility functions for the Gantt dispatch board.
 * No DB access — safe to import in tests without mocking.
 */

export interface TimeBlock {
    id: string;
    plannedStart: Date;
    plannedEnd: Date;
}

// ─── Positioning ──────────────────────────────────────────────────────────────

/**
 * Convert a point in time to a 0-100% position within a view window.
 * Times outside the window are clamped.
 */
export function timeToPercent(time: Date, viewStart: Date, viewEnd: Date): number {
    const total = viewEnd.getTime() - viewStart.getTime();
    if (total <= 0) return 0;
    const offset = time.getTime() - viewStart.getTime();
    return Math.max(0, Math.min(100, (offset / total) * 100));
}

/**
 * Left offset (0–100%) for a scheduled block within the view window.
 */
export function calcBlockLeft(plannedStart: Date, viewStart: Date, viewEnd: Date): number {
    return timeToPercent(plannedStart, viewStart, viewEnd);
}

/**
 * Width (0–100%) for a block clamped to the view window.
 * Guarantees the block doesn't overflow either edge.
 */
export function calcBlockWidth(
    plannedStart: Date,
    plannedEnd: Date,
    viewStart: Date,
    viewEnd: Date,
): number {
    const total = viewEnd.getTime() - viewStart.getTime();
    if (total <= 0) return 0;
    const clampedStart = Math.max(plannedStart.getTime(), viewStart.getTime());
    const clampedEnd   = Math.min(plannedEnd.getTime(),   viewEnd.getTime());
    if (clampedEnd <= clampedStart) return 0;
    return ((clampedEnd - clampedStart) / total) * 100;
}

/**
 * Convert a pixel X offset within a timeline container to a Date.
 */
export function pixelToTime(
    pixelX: number,
    containerWidth: number,
    viewStart: Date,
    viewEnd: Date,
): Date {
    if (containerWidth <= 0) return viewStart;
    const ratio = Math.max(0, Math.min(1, pixelX / containerWidth));
    const ms    = viewStart.getTime() + ratio * (viewEnd.getTime() - viewStart.getTime());
    return new Date(ms);
}

// ─── Grid snapping ────────────────────────────────────────────────────────────

/**
 * Snap a Date to the nearest multiple of gridMinutes.
 * gridMinutes must be > 0.
 */
export function snapToGrid(date: Date, gridMinutes: number): Date {
    if (gridMinutes <= 0) return date;
    const ms      = gridMinutes * 60_000;
    const snapped = Math.round(date.getTime() / ms) * ms;
    return new Date(snapped);
}

/**
 * Clamp a Date within [min, max].
 */
export function clampDate(date: Date, min: Date, max: Date): Date {
    if (date.getTime() < min.getTime()) return min;
    if (date.getTime() > max.getTime()) return max;
    return date;
}

// ─── Overlap & conflict detection ─────────────────────────────────────────────

/**
 * Returns true if [newStart, newEnd) overlaps any block in `existing`,
 * excluding the block with `excludeId` (the block being dragged).
 * Touching boundaries (end === start) are NOT considered overlaps.
 */
export function detectDropOverlap(
    newStart: Date,
    newEnd: Date,
    existing: Array<{ id: string; plannedStart: Date; plannedEnd: Date }>,
    excludeId: string,
): boolean {
    for (const b of existing) {
        if (b.id === excludeId) continue;
        if (newStart.getTime() < b.plannedEnd.getTime() &&
            newEnd.getTime()   > b.plannedStart.getTime()) {
            return true;
        }
    }
    return false;
}

/**
 * True if the schedule's planned end exceeds the work order's due date.
 * Returns false when dueDate is null/undefined (no deadline set).
 */
export function isScheduleDelayed(plannedEnd: Date, dueDate: Date | null | undefined): boolean {
    if (!dueDate) return false;
    return plannedEnd.getTime() > dueDate.getTime();
}

// ─── Utilization ──────────────────────────────────────────────────────────────

/**
 * Percentage of the period covered by scheduled blocks (0–100, capped).
 * Blocks are clamped to the period before accumulation.
 */
export function calcMachineUtilization(
    schedules: Array<{ plannedStart: Date; plannedEnd: Date }>,
    periodStart: Date,
    periodEnd: Date,
): number {
    const periodMs = periodEnd.getTime() - periodStart.getTime();
    if (periodMs <= 0) return 0;
    let usedMs = 0;
    for (const s of schedules) {
        const start = Math.max(s.plannedStart.getTime(), periodStart.getTime());
        const end   = Math.min(s.plannedEnd.getTime(),   periodEnd.getTime());
        if (end > start) usedMs += end - start;
    }
    return Math.min(100, (usedMs / periodMs) * 100);
}

// ─── Color / label helpers ────────────────────────────────────────────────────

/**
 * Tailwind background class for a conflict's severity level.
 */
export function conflictSeverityClass(severity: string): string {
    switch (severity) {
        case 'CRITICAL': return 'bg-red-500';
        case 'WARNING':  return 'bg-amber-500';
        case 'INFO':     return 'bg-blue-400';
        default:         return 'bg-gray-400';
    }
}

/**
 * Color theme for a machine's utilization percentage.
 * < 70 % → green (capacity available)
 * 70–89 % → amber (approaching capacity)
 * ≥ 90 % → red (over-loaded)
 */
export function utilizationColor(pct: number): 'green' | 'amber' | 'red' {
    if (pct < 70) return 'green';
    if (pct < 90) return 'amber';
    return 'red';
}

/**
 * Human-readable adherence label based on drift minutes.
 * ≤ 0 → on-time (early or exact), 1–30 → minor-delay, > 30 → major-delay.
 */
export function adherenceLabel(driftMinutes: number): 'on-time' | 'minor-delay' | 'major-delay' {
    if (driftMinutes <= 0)  return 'on-time';
    if (driftMinutes <= 30) return 'minor-delay';
    return 'major-delay';
}

/**
 * Tailwind background class for a schedule status badge.
 */
export function statusColor(status: string): string {
    switch (status) {
        case 'SCHEDULED':   return 'bg-blue-500';
        case 'IN_PROGRESS': return 'bg-emerald-500';
        case 'DRIFTED':     return 'bg-amber-500';
        case 'COMPLETED':   return 'bg-gray-400';
        case 'CANCELLED':   return 'bg-red-400';
        default:            return 'bg-gray-300';
    }
}

// ─── Hour ruler ───────────────────────────────────────────────────────────────

export interface RulerMark {
    label: string;
    leftPct: number;
}

/**
 * Generate hour marks for the timeline ruler.
 * Interval is chosen so that ~10–14 ticks fit in the view.
 */
export function buildRulerMarks(viewStart: Date, viewEnd: Date): RulerMark[] {
    const totalHours = (viewEnd.getTime() - viewStart.getTime()) / 3_600_000;
    const intervalH  = totalHours <= 24 ? 2 : totalHours <= 48 ? 4 : 6;

    const marks: RulerMark[] = [];
    // Start at the first full interval-boundary hour at or after viewStart
    const startMs   = viewStart.getTime();
    const intervalMs = intervalH * 3_600_000;
    let tick = Math.ceil(startMs / intervalMs) * intervalMs;

    while (tick <= viewEnd.getTime()) {
        const date = new Date(tick);
        marks.push({
            label:   date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            leftPct: timeToPercent(date, viewStart, viewEnd),
        });
        tick += intervalMs;
    }
    return marks;
}

/**
 * Maintenance window clipped to the view window, as percentages.
 * Returns null when the window is fully outside the view.
 */
export interface MaintOverlay {
    leftPct:  number;
    widthPct: number;
    reason:   string;
}

export function calcMaintOverlay(
    windowStart: Date,
    windowEnd: Date,
    viewStart: Date,
    viewEnd: Date,
    reason: string,
): MaintOverlay | null {
    if (windowEnd.getTime() <= viewStart.getTime()) return null;
    if (windowStart.getTime() >= viewEnd.getTime()) return null;
    const left  = calcBlockLeft(windowStart, viewStart, viewEnd);
    const width = calcBlockWidth(windowStart, windowEnd, viewStart, viewEnd);
    if (width <= 0) return null;
    return { leftPct: left, widthPct: width, reason };
}
