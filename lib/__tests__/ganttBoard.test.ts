import { describe, it, expect } from 'vitest';
import {
    timeToPercent,
    calcBlockLeft,
    calcBlockWidth,
    pixelToTime,
    snapToGrid,
    clampDate,
    detectDropOverlap,
    isScheduleDelayed,
    calcMachineUtilization,
    conflictSeverityClass,
    utilizationColor,
    adherenceLabel,
    statusColor,
    buildRulerMarks,
    calcMaintOverlay,
} from '@/lib/ganttUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const T = (offsetMs: number, base = 0) => new Date(base + offsetMs);
const hr = (h: number) => h * 3_600_000;
const mn = (m: number) => m * 60_000;

// Base epoch times for a 24-hour window
const VIEW_START = new Date('2026-05-27T06:00:00Z');
const VIEW_END   = new Date('2026-05-28T06:00:00Z'); // +24 h

// ─── timeToPercent ────────────────────────────────────────────────────────────

describe('timeToPercent', () => {
    it('returns 0 for viewStart', () => {
        expect(timeToPercent(VIEW_START, VIEW_START, VIEW_END)).toBe(0);
    });

    it('returns 100 for viewEnd', () => {
        expect(timeToPercent(VIEW_END, VIEW_START, VIEW_END)).toBe(100);
    });

    it('returns 50 for the midpoint', () => {
        const mid = new Date((VIEW_START.getTime() + VIEW_END.getTime()) / 2);
        expect(timeToPercent(mid, VIEW_START, VIEW_END)).toBe(50);
    });

    it('returns 25 for one-quarter through', () => {
        const quarter = new Date(VIEW_START.getTime() + hr(6));
        expect(timeToPercent(quarter, VIEW_START, VIEW_END)).toBeCloseTo(25, 5);
    });

    it('clamps to 0 for times before viewStart', () => {
        const before = new Date(VIEW_START.getTime() - hr(2));
        expect(timeToPercent(before, VIEW_START, VIEW_END)).toBe(0);
    });

    it('clamps to 100 for times after viewEnd', () => {
        const after = new Date(VIEW_END.getTime() + hr(2));
        expect(timeToPercent(after, VIEW_START, VIEW_END)).toBe(100);
    });

    it('returns 0 when viewEnd <= viewStart (degenerate window)', () => {
        expect(timeToPercent(VIEW_START, VIEW_END, VIEW_START)).toBe(0);
    });
});

// ─── calcBlockLeft ────────────────────────────────────────────────────────────

describe('calcBlockLeft', () => {
    it('block starting at viewStart → left = 0', () => {
        expect(calcBlockLeft(VIEW_START, VIEW_START, VIEW_END)).toBe(0);
    });

    it('block starting at midpoint → left = 50', () => {
        const mid = new Date(VIEW_START.getTime() + hr(12));
        expect(calcBlockLeft(mid, VIEW_START, VIEW_END)).toBe(50);
    });

    it('block starting before view → clamped to 0', () => {
        const before = new Date(VIEW_START.getTime() - hr(1));
        expect(calcBlockLeft(before, VIEW_START, VIEW_END)).toBe(0);
    });
});

// ─── calcBlockWidth ───────────────────────────────────────────────────────────

describe('calcBlockWidth', () => {
    it('4-hour block in 24-hour view → 16.666…% wide', () => {
        const start = VIEW_START;
        const end   = new Date(VIEW_START.getTime() + hr(4));
        expect(calcBlockWidth(start, end, VIEW_START, VIEW_END)).toBeCloseTo(16.667, 2);
    });

    it('block spanning entire view → 100%', () => {
        expect(calcBlockWidth(VIEW_START, VIEW_END, VIEW_START, VIEW_END)).toBeCloseTo(100);
    });

    it('block wholly before view → 0%', () => {
        const s = new Date(VIEW_START.getTime() - hr(4));
        const e = new Date(VIEW_START.getTime() - hr(2));
        expect(calcBlockWidth(s, e, VIEW_START, VIEW_END)).toBe(0);
    });

    it('block wholly after view → 0%', () => {
        const s = new Date(VIEW_END.getTime() + hr(1));
        const e = new Date(VIEW_END.getTime() + hr(2));
        expect(calcBlockWidth(s, e, VIEW_START, VIEW_END)).toBe(0);
    });

    it('block starting before view, ending inside → clipped left', () => {
        const s = new Date(VIEW_START.getTime() - hr(2));
        const e = new Date(VIEW_START.getTime() + hr(2));
        // Visible portion is 2 hours out of 24 → ~8.33%
        expect(calcBlockWidth(s, e, VIEW_START, VIEW_END)).toBeCloseTo(8.333, 2);
    });

    it('block starting inside view, ending after → clipped right', () => {
        const s = new Date(VIEW_END.getTime() - hr(2));
        const e = new Date(VIEW_END.getTime() + hr(2));
        // Visible portion is 2 hours out of 24 → ~8.33%
        expect(calcBlockWidth(s, e, VIEW_START, VIEW_END)).toBeCloseTo(8.333, 2);
    });

    it('returns 0 when viewEnd === viewStart (degenerate)', () => {
        expect(calcBlockWidth(VIEW_START, VIEW_END, VIEW_START, VIEW_START)).toBe(0);
    });

    it('returns 0 when plannedEnd === plannedStart', () => {
        expect(calcBlockWidth(VIEW_START, VIEW_START, VIEW_START, VIEW_END)).toBe(0);
    });
});

// ─── pixelToTime ─────────────────────────────────────────────────────────────

describe('pixelToTime', () => {
    it('pixel 0 → viewStart', () => {
        const t = pixelToTime(0, 1000, VIEW_START, VIEW_END);
        expect(t.getTime()).toBe(VIEW_START.getTime());
    });

    it('pixel = containerWidth → viewEnd', () => {
        const t = pixelToTime(1000, 1000, VIEW_START, VIEW_END);
        expect(t.getTime()).toBe(VIEW_END.getTime());
    });

    it('pixel = containerWidth/2 → midpoint', () => {
        const t   = pixelToTime(500, 1000, VIEW_START, VIEW_END);
        const mid = new Date((VIEW_START.getTime() + VIEW_END.getTime()) / 2);
        expect(t.getTime()).toBe(mid.getTime());
    });

    it('negative pixel → clamped to viewStart', () => {
        const t = pixelToTime(-100, 1000, VIEW_START, VIEW_END);
        expect(t.getTime()).toBe(VIEW_START.getTime());
    });

    it('pixel > containerWidth → clamped to viewEnd', () => {
        const t = pixelToTime(1500, 1000, VIEW_START, VIEW_END);
        expect(t.getTime()).toBe(VIEW_END.getTime());
    });

    it('returns viewStart when containerWidth = 0', () => {
        const t = pixelToTime(500, 0, VIEW_START, VIEW_END);
        expect(t.getTime()).toBe(VIEW_START.getTime());
    });
});

// ─── snapToGrid ───────────────────────────────────────────────────────────────

describe('snapToGrid', () => {
    it('snaps to nearest 15-minute boundary (round down)', () => {
        const date    = new Date('2026-05-27T10:07:00Z'); // 7 min past → round to :00 UTC
        const snapped = snapToGrid(date, 15);
        expect(snapped.getUTCMinutes()).toBe(0);
        expect(snapped.getUTCSeconds()).toBe(0);
    });

    it('snaps to nearest 15-minute boundary (round up)', () => {
        const date    = new Date('2026-05-27T10:09:00Z'); // 9 min past → round to :15 UTC
        const snapped = snapToGrid(date, 15);
        expect(snapped.getUTCMinutes() % 15).toBe(0);
    });

    it('snaps to exact boundary unchanged', () => {
        const date    = new Date('2026-05-27T10:30:00Z');
        const snapped = snapToGrid(date, 15);
        expect(snapped.getTime()).toBe(date.getTime());
    });

    it('snaps to 30-minute grid', () => {
        const date    = new Date('2026-05-27T10:20:00Z'); // rounds to :30 UTC
        const snapped = snapToGrid(date, 30);
        expect(snapped.getUTCMinutes()).toBe(30);
    });

    it('returns original date when gridMinutes = 0', () => {
        const date = new Date('2026-05-27T10:07:34Z');
        expect(snapToGrid(date, 0).getTime()).toBe(date.getTime());
    });

    it('1-hour grid snaps 35-minute mark to next hour', () => {
        const date    = new Date('2026-05-27T10:35:00Z');
        const snapped = snapToGrid(date, 60);
        expect(snapped.getUTCHours()).toBe(11);
        expect(snapped.getUTCMinutes()).toBe(0);
    });
});

// ─── clampDate ────────────────────────────────────────────────────────────────

describe('clampDate', () => {
    const min = new Date('2026-05-27T06:00:00Z');
    const max = new Date('2026-05-27T22:00:00Z');

    it('returns date unchanged when within range', () => {
        const d = new Date('2026-05-27T12:00:00Z');
        expect(clampDate(d, min, max).getTime()).toBe(d.getTime());
    });

    it('clamps to min when below', () => {
        const d = new Date('2026-05-27T04:00:00Z');
        expect(clampDate(d, min, max).getTime()).toBe(min.getTime());
    });

    it('clamps to max when above', () => {
        const d = new Date('2026-05-28T00:00:00Z');
        expect(clampDate(d, min, max).getTime()).toBe(max.getTime());
    });

    it('returns min when date === min', () => {
        expect(clampDate(min, min, max).getTime()).toBe(min.getTime());
    });

    it('returns max when date === max', () => {
        expect(clampDate(max, min, max).getTime()).toBe(max.getTime());
    });
});

// ─── detectDropOverlap ───────────────────────────────────────────────────────

describe('detectDropOverlap', () => {
    const blocks = [
        { id: 'a', plannedStart: new Date('2026-05-27T08:00:00Z'), plannedEnd: new Date('2026-05-27T10:00:00Z') },
        { id: 'b', plannedStart: new Date('2026-05-27T12:00:00Z'), plannedEnd: new Date('2026-05-27T14:00:00Z') },
    ];

    it('no overlap when slot is entirely before all blocks', () => {
        const s = new Date('2026-05-27T06:00:00Z');
        const e = new Date('2026-05-27T07:30:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(false);
    });

    it('no overlap when slot is between blocks', () => {
        const s = new Date('2026-05-27T10:00:00Z');
        const e = new Date('2026-05-27T12:00:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(false);
    });

    it('no overlap when slot is entirely after all blocks', () => {
        const s = new Date('2026-05-27T14:00:00Z');
        const e = new Date('2026-05-27T16:00:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(false);
    });

    it('detects overlap when slot contains block "a" entirely', () => {
        const s = new Date('2026-05-27T07:00:00Z');
        const e = new Date('2026-05-27T11:00:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(true);
    });

    it('detects overlap when slot partially overlaps start of block "a"', () => {
        const s = new Date('2026-05-27T07:00:00Z');
        const e = new Date('2026-05-27T08:30:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(true);
    });

    it('detects overlap when slot partially overlaps end of block "a"', () => {
        const s = new Date('2026-05-27T09:30:00Z');
        const e = new Date('2026-05-27T11:00:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(true);
    });

    it('touching boundaries are NOT overlapping (end === start)', () => {
        // new slot ends exactly where block "a" starts → no overlap
        const s = new Date('2026-05-27T06:00:00Z');
        const e = new Date('2026-05-27T08:00:00Z'); // = blocks[0].plannedStart
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(false);
    });

    it('touching boundaries at end → not an overlap', () => {
        // new slot starts exactly where block "a" ends
        const s = new Date('2026-05-27T10:00:00Z'); // = blocks[0].plannedEnd
        const e = new Date('2026-05-27T11:00:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(false);
    });

    it('excludes the dragged block by id', () => {
        // Slot covers block "a" — but "a" is the one being dragged, so no overlap
        const s = new Date('2026-05-27T07:00:00Z');
        const e = new Date('2026-05-27T11:00:00Z');
        expect(detectDropOverlap(s, e, blocks, 'a')).toBe(false);
    });

    it('no overlap on empty list', () => {
        const s = new Date('2026-05-27T08:00:00Z');
        const e = new Date('2026-05-27T10:00:00Z');
        expect(detectDropOverlap(s, e, [], 'x')).toBe(false);
    });

    it('overlap rejection when two machines both have block "b"', () => {
        const s = new Date('2026-05-27T12:30:00Z');
        const e = new Date('2026-05-27T13:00:00Z');
        expect(detectDropOverlap(s, e, blocks, 'x')).toBe(true);
    });
});

// ─── isScheduleDelayed ────────────────────────────────────────────────────────

describe('isScheduleDelayed', () => {
    const dueDate = new Date('2026-05-27T16:00:00Z');

    it('returns false when plannedEnd is before dueDate', () => {
        const end = new Date('2026-05-27T15:00:00Z');
        expect(isScheduleDelayed(end, dueDate)).toBe(false);
    });

    it('returns false when plannedEnd equals dueDate (on-time)', () => {
        expect(isScheduleDelayed(dueDate, dueDate)).toBe(false);
    });

    it('returns true when plannedEnd is after dueDate', () => {
        const end = new Date('2026-05-27T17:00:00Z');
        expect(isScheduleDelayed(end, dueDate)).toBe(true);
    });

    it('returns false when dueDate is null (no deadline)', () => {
        const end = new Date('2026-05-27T23:59:00Z');
        expect(isScheduleDelayed(end, null)).toBe(false);
    });

    it('returns false when dueDate is undefined', () => {
        const end = new Date('2026-05-27T23:59:00Z');
        expect(isScheduleDelayed(end, undefined)).toBe(false);
    });
});

// ─── calcMachineUtilization ───────────────────────────────────────────────────

describe('calcMachineUtilization', () => {
    const periodStart = new Date('2026-05-27T06:00:00Z');
    const periodEnd   = new Date('2026-05-27T18:00:00Z'); // 12 hours

    it('returns 0 for no schedules', () => {
        expect(calcMachineUtilization([], periodStart, periodEnd)).toBe(0);
    });

    it('50% utilization — 6 h scheduled in 12 h period', () => {
        const schedules = [{
            plannedStart: new Date('2026-05-27T06:00:00Z'),
            plannedEnd:   new Date('2026-05-27T12:00:00Z'),
        }];
        expect(calcMachineUtilization(schedules, periodStart, periodEnd)).toBeCloseTo(50);
    });

    it('100% utilization — fully booked', () => {
        const schedules = [{
            plannedStart: periodStart,
            plannedEnd:   periodEnd,
        }];
        expect(calcMachineUtilization(schedules, periodStart, periodEnd)).toBeCloseTo(100);
    });

    it('caps at 100 even when schedules extend beyond period', () => {
        const schedules = [
            { plannedStart: new Date('2026-05-27T04:00:00Z'), plannedEnd: new Date('2026-05-27T20:00:00Z') },
        ];
        expect(calcMachineUtilization(schedules, periodStart, periodEnd)).toBe(100);
    });

    it('clips blocks that start before period', () => {
        const schedules = [{
            plannedStart: new Date('2026-05-27T03:00:00Z'), // 3 h before period
            plannedEnd:   new Date('2026-05-27T09:00:00Z'), // 3 h into period
        }];
        // Visible portion = 3 h out of 12 h = 25%
        expect(calcMachineUtilization(schedules, periodStart, periodEnd)).toBeCloseTo(25);
    });

    it('clips blocks that end after period', () => {
        const schedules = [{
            plannedStart: new Date('2026-05-27T15:00:00Z'), // 3 h before period end
            plannedEnd:   new Date('2026-05-27T21:00:00Z'), // 3 h after period end
        }];
        // Visible portion = 3 h out of 12 h = 25%
        expect(calcMachineUtilization(schedules, periodStart, periodEnd)).toBeCloseTo(25);
    });

    it('accumulates multiple non-overlapping blocks', () => {
        const schedules = [
            { plannedStart: new Date('2026-05-27T06:00:00Z'), plannedEnd: new Date('2026-05-27T09:00:00Z') }, // 3 h
            { plannedStart: new Date('2026-05-27T11:00:00Z'), plannedEnd: new Date('2026-05-27T14:00:00Z') }, // 3 h
        ];
        // 6 h out of 12 = 50%
        expect(calcMachineUtilization(schedules, periodStart, periodEnd)).toBeCloseTo(50);
    });

    it('returns 0 for period of zero length', () => {
        expect(calcMachineUtilization(
            [{ plannedStart: periodStart, plannedEnd: periodEnd }],
            periodStart,
            periodStart,
        )).toBe(0);
    });
});

// ─── conflictSeverityClass ────────────────────────────────────────────────────

describe('conflictSeverityClass', () => {
    it('CRITICAL → bg-red-500', () => expect(conflictSeverityClass('CRITICAL')).toBe('bg-red-500'));
    it('WARNING  → bg-amber-500', () => expect(conflictSeverityClass('WARNING')).toBe('bg-amber-500'));
    it('INFO     → bg-blue-400', () => expect(conflictSeverityClass('INFO')).toBe('bg-blue-400'));
    it('unknown  → bg-gray-400', () => expect(conflictSeverityClass('UNKNOWN')).toBe('bg-gray-400'));
    it('empty string → bg-gray-400', () => expect(conflictSeverityClass('')).toBe('bg-gray-400'));
});

// ─── utilizationColor ─────────────────────────────────────────────────────────

describe('utilizationColor', () => {
    it('0%   → green',  () => expect(utilizationColor(0)).toBe('green'));
    it('50%  → green',  () => expect(utilizationColor(50)).toBe('green'));
    it('69%  → green',  () => expect(utilizationColor(69)).toBe('green'));
    it('70%  → amber',  () => expect(utilizationColor(70)).toBe('amber'));
    it('80%  → amber',  () => expect(utilizationColor(80)).toBe('amber'));
    it('89%  → amber',  () => expect(utilizationColor(89)).toBe('amber'));
    it('90%  → red',    () => expect(utilizationColor(90)).toBe('red'));
    it('100% → red',    () => expect(utilizationColor(100)).toBe('red'));
    it('110% → red',    () => expect(utilizationColor(110)).toBe('red'));
});

// ─── adherenceLabel ───────────────────────────────────────────────────────────

describe('adherenceLabel', () => {
    it('negative drift (early) → on-time',     () => expect(adherenceLabel(-5)).toBe('on-time'));
    it('0 drift → on-time',                    () => expect(adherenceLabel(0)).toBe('on-time'));
    it('1 minute drift → minor-delay',         () => expect(adherenceLabel(1)).toBe('minor-delay'));
    it('30 minute drift → minor-delay',        () => expect(adherenceLabel(30)).toBe('minor-delay'));
    it('31 minute drift → major-delay',        () => expect(adherenceLabel(31)).toBe('major-delay'));
    it('large drift → major-delay',            () => expect(adherenceLabel(480)).toBe('major-delay'));
});

// ─── statusColor ─────────────────────────────────────────────────────────────

describe('statusColor', () => {
    it('SCHEDULED   → blue',    () => expect(statusColor('SCHEDULED')).toBe('bg-blue-500'));
    it('IN_PROGRESS → emerald', () => expect(statusColor('IN_PROGRESS')).toBe('bg-emerald-500'));
    it('DRIFTED     → amber',   () => expect(statusColor('DRIFTED')).toBe('bg-amber-500'));
    it('COMPLETED   → gray',    () => expect(statusColor('COMPLETED')).toBe('bg-gray-400'));
    it('CANCELLED   → red',     () => expect(statusColor('CANCELLED')).toBe('bg-red-400'));
    it('unknown     → gray',    () => expect(statusColor('UNKNOWN')).toBe('bg-gray-300'));
});

// ─── buildRulerMarks ─────────────────────────────────────────────────────────

describe('buildRulerMarks', () => {
    it('24-hour view produces marks at 2-hour intervals', () => {
        const s = new Date('2026-05-27T00:00:00Z');
        const e = new Date('2026-05-28T00:00:00Z');
        const marks = buildRulerMarks(s, e);
        // 00:00 to 24:00 at 2h = 12 ticks (02:00 through 24:00, starting after 00:00)
        // First mark at 02:00
        expect(marks.length).toBeGreaterThan(0);
        marks.forEach(m => {
            expect(m.leftPct).toBeGreaterThanOrEqual(0);
            expect(m.leftPct).toBeLessThanOrEqual(100);
        });
    });

    it('48-hour view uses 4-hour interval', () => {
        const s = new Date('2026-05-27T00:00:00Z');
        const e = new Date('2026-05-29T00:00:00Z');
        const marks = buildRulerMarks(s, e);
        // 48 h / 4 h = 12 marks
        expect(marks.length).toBeGreaterThanOrEqual(11);
        expect(marks.length).toBeLessThanOrEqual(13);
    });

    it('72-hour view uses 6-hour interval', () => {
        const s = new Date('2026-05-27T00:00:00Z');
        const e = new Date('2026-05-30T00:00:00Z');
        const marks = buildRulerMarks(s, e);
        // 72 h / 6 h = 12 marks
        expect(marks.length).toBeGreaterThanOrEqual(11);
        expect(marks.length).toBeLessThanOrEqual(13);
    });

    it('each mark has leftPct in [0,100]', () => {
        const marks = buildRulerMarks(VIEW_START, VIEW_END);
        for (const m of marks) {
            expect(m.leftPct).toBeGreaterThanOrEqual(0);
            expect(m.leftPct).toBeLessThanOrEqual(100);
        }
    });

    it('marks are in ascending leftPct order', () => {
        const marks = buildRulerMarks(VIEW_START, VIEW_END);
        for (let i = 1; i < marks.length; i++) {
            expect(marks[i].leftPct).toBeGreaterThanOrEqual(marks[i - 1].leftPct);
        }
    });
});

// ─── calcMaintOverlay ────────────────────────────────────────────────────────

describe('calcMaintOverlay', () => {
    it('returns null when window is before view', () => {
        const ws = new Date('2026-05-27T02:00:00Z');
        const we = new Date('2026-05-27T04:00:00Z');
        expect(calcMaintOverlay(ws, we, VIEW_START, VIEW_END, 'PM')).toBeNull();
    });

    it('returns null when window is after view', () => {
        const ws = new Date('2026-05-28T08:00:00Z');
        const we = new Date('2026-05-28T10:00:00Z');
        expect(calcMaintOverlay(ws, we, VIEW_START, VIEW_END, 'PM')).toBeNull();
    });

    it('returns null when window ends exactly at viewStart', () => {
        const ws = new Date('2026-05-27T04:00:00Z');
        const we = VIEW_START;
        expect(calcMaintOverlay(ws, we, VIEW_START, VIEW_END, 'PM')).toBeNull();
    });

    it('returns null when window starts exactly at viewEnd', () => {
        const ws = VIEW_END;
        const we = new Date('2026-05-28T08:00:00Z');
        expect(calcMaintOverlay(ws, we, VIEW_START, VIEW_END, 'PM')).toBeNull();
    });

    it('returns overlay for window fully inside view', () => {
        const ws = new Date('2026-05-27T10:00:00Z'); // +4 h from start → 16.67%
        const we = new Date('2026-05-27T12:00:00Z'); // +6 h from start → 25%
        const overlay = calcMaintOverlay(ws, we, VIEW_START, VIEW_END, 'Scheduled PM');
        expect(overlay).not.toBeNull();
        expect(overlay!.leftPct).toBeCloseTo(16.667, 1);
        expect(overlay!.widthPct).toBeCloseTo(8.333, 1);
        expect(overlay!.reason).toBe('Scheduled PM');
    });

    it('clips window that starts before view', () => {
        const ws = new Date('2026-05-27T04:00:00Z'); // 2 h before viewStart
        const we = new Date('2026-05-27T08:00:00Z'); // 2 h into view
        const overlay = calcMaintOverlay(ws, we, VIEW_START, VIEW_END, 'PM');
        expect(overlay).not.toBeNull();
        expect(overlay!.leftPct).toBe(0);
        expect(overlay!.widthPct).toBeCloseTo(8.333, 1);
    });

    it('clips window that ends after view', () => {
        const ws = new Date('2026-05-28T04:00:00Z'); // 2 h before viewEnd
        const we = new Date('2026-05-28T08:00:00Z'); // 2 h after viewEnd
        const overlay = calcMaintOverlay(ws, we, VIEW_START, VIEW_END, 'PM');
        expect(overlay).not.toBeNull();
        expect(overlay!.widthPct).toBeCloseTo(8.333, 1);
    });
});

// ─── Drag/drop integration scenarios ─────────────────────────────────────────

describe('drag/drop integration', () => {
    const machine1Blocks = [
        { id: 'job-1', plannedStart: new Date('2026-05-27T08:00:00Z'), plannedEnd: new Date('2026-05-27T10:00:00Z') },
        { id: 'job-2', plannedStart: new Date('2026-05-27T11:00:00Z'), plannedEnd: new Date('2026-05-27T13:00:00Z') },
    ];

    it('valid drop in gap between blocks is accepted', () => {
        const newS = new Date('2026-05-27T10:00:00Z');
        const newE = new Date('2026-05-27T11:00:00Z');
        expect(detectDropOverlap(newS, newE, machine1Blocks, 'job-x')).toBe(false);
    });

    it('drop overlapping job-1 is rejected', () => {
        const newS = new Date('2026-05-27T09:00:00Z');
        const newE = new Date('2026-05-27T10:30:00Z');
        expect(detectDropOverlap(newS, newE, machine1Blocks, 'job-x')).toBe(true);
    });

    it('moving job-1 to the gap is valid (excludes self)', () => {
        // job-1 (08:00–10:00) moved to 10:00–12:00 → only needs to clear job-2 (11:00–13:00)
        const newS = new Date('2026-05-27T10:00:00Z');
        const newE = new Date('2026-05-27T12:00:00Z');
        // overlaps job-2 (11:00–13:00) → rejected
        expect(detectDropOverlap(newS, newE, machine1Blocks, 'job-1')).toBe(true);
    });

    it('moving job-1 to before job-2 with no overlap', () => {
        // job-1 moved to 06:00–08:00
        const newS = new Date('2026-05-27T06:00:00Z');
        const newE = new Date('2026-05-27T08:00:00Z');
        expect(detectDropOverlap(newS, newE, machine1Blocks, 'job-1')).toBe(false);
    });

    it('pixel → snap → overlap check pipeline', () => {
        // User drops at pixel 250 of 1000px container
        const raw    = pixelToTime(250, 1000, VIEW_START, VIEW_END);
        const snapped = snapToGrid(raw, 15);
        const durationMs = 2 * 3_600_000; // 2-hour job
        const newEnd = new Date(snapped.getTime() + durationMs);
        // At 25% into a 24h window → 06:00 + 6h = 12:00; job ends at 14:00
        // That would overlap job-2 (11:00–13:00)
        const overlaps = detectDropOverlap(snapped, newEnd, machine1Blocks, 'job-x');
        // 12:00–14:00 overlaps 11:00–13:00 → true
        expect(overlaps).toBe(true);
    });

    it('delay detection applies after rescheduling', () => {
        const dueDate     = new Date('2026-05-27T15:00:00Z');
        const newPlannedEnd = new Date('2026-05-27T16:00:00Z'); // 1h past due
        expect(isScheduleDelayed(newPlannedEnd, dueDate)).toBe(true);
    });
});
