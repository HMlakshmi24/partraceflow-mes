import { describe, it, expect } from 'vitest';
import {
    calcScheduledDuration,
    detectOverlap,
    isWorkingDay,
    isInShiftWindow,
    hasMaintConflict,
    calcAdherence,
    calcDrift,
    calcCapacityUtilization,
    findEarliestSlot,
    type ShiftWindow,
    type MaintenanceWindow,
} from '../services/SchedulerService';

// ── calcScheduledDuration ─────────────────────────────────────────────────────

describe('calcScheduledDuration', () => {
    it('returns correct minutes for 100 units at 50/hr', () => {
        expect(calcScheduledDuration(100, 50)).toBe(120);
    });

    it('returns correct minutes for 1 unit at 60/hr', () => {
        expect(calcScheduledDuration(1, 60)).toBeCloseTo(1, 5);
    });

    it('returns 0 for zero quantity', () => {
        expect(calcScheduledDuration(0, 60)).toBe(0);
    });

    it('returns 0 for zero capacity', () => {
        expect(calcScheduledDuration(100, 0)).toBe(0);
    });

    it('returns 0 for negative capacity', () => {
        expect(calcScheduledDuration(100, -10)).toBe(0);
    });

    it('returns 0 for negative quantity', () => {
        expect(calcScheduledDuration(-5, 60)).toBe(0);
    });

    it('handles fractional results correctly', () => {
        // 10 units at 3/hr = 200 min
        expect(calcScheduledDuration(10, 3)).toBeCloseTo(200, 5);
    });

    it('large batch: 10000 units at 1000/hr = 600 minutes', () => {
        expect(calcScheduledDuration(10_000, 1_000)).toBe(600);
    });
});

// ── detectOverlap ─────────────────────────────────────────────────────────────

describe('detectOverlap', () => {
    const t = (h: number) => new Date(2026, 0, 1, h, 0, 0);

    it('detects full containment', () => {
        expect(detectOverlap({ start: t(8), end: t(16) }, { start: t(10), end: t(14) })).toBe(true);
    });

    it('detects partial overlap (a starts before b ends)', () => {
        expect(detectOverlap({ start: t(8), end: t(12) }, { start: t(10), end: t(16) })).toBe(true);
    });

    it('detects partial overlap (b starts before a ends)', () => {
        expect(detectOverlap({ start: t(10), end: t(16) }, { start: t(8), end: t(12) })).toBe(true);
    });

    it('no overlap when a ends exactly at b start (touching, not overlapping)', () => {
        expect(detectOverlap({ start: t(8), end: t(10) }, { start: t(10), end: t(12) })).toBe(false);
    });

    it('no overlap when a is entirely before b', () => {
        expect(detectOverlap({ start: t(6), end: t(8) }, { start: t(10), end: t(14) })).toBe(false);
    });

    it('no overlap when a is entirely after b', () => {
        expect(detectOverlap({ start: t(14), end: t(16) }, { start: t(8), end: t(12) })).toBe(false);
    });

    it('identical intervals overlap', () => {
        expect(detectOverlap({ start: t(8), end: t(16) }, { start: t(8), end: t(16) })).toBe(true);
    });
});

// ── isWorkingDay ──────────────────────────────────────────────────────────────

describe('isWorkingDay', () => {
    // Jan 5 2026 is Monday (day=1)
    const monday    = new Date(2026, 0, 5);
    // Jan 10 2026 is Saturday (day=6)
    const saturday  = new Date(2026, 0, 10);
    // Jan 11 2026 is Sunday (day=0)
    const sunday    = new Date(2026, 0, 11);

    it('Monday is a working day [1,2,3,4,5]', () => {
        expect(isWorkingDay(monday, [1, 2, 3, 4, 5])).toBe(true);
    });

    it('Saturday is not a working day [1,2,3,4,5]', () => {
        expect(isWorkingDay(saturday, [1, 2, 3, 4, 5])).toBe(false);
    });

    it('Saturday is working day in 6-day week [1,2,3,4,5,6]', () => {
        expect(isWorkingDay(saturday, [1, 2, 3, 4, 5, 6])).toBe(true);
    });

    it('Sunday is not in a typical 6-day week', () => {
        expect(isWorkingDay(sunday, [1, 2, 3, 4, 5, 6])).toBe(false);
    });

    it('empty workingDays array → no day is working', () => {
        expect(isWorkingDay(monday, [])).toBe(false);
    });

    it('7-day operation includes all days', () => {
        expect(isWorkingDay(sunday, [0, 1, 2, 3, 4, 5, 6])).toBe(true);
    });
});

// ── isInShiftWindow ───────────────────────────────────────────────────────────

describe('isInShiftWindow', () => {
    const dayShift: ShiftWindow = { name: 'Day',   startHour: 6,  startMin: 0, endHour: 14, endMin: 0 };
    const nightShift: ShiftWindow = { name: 'Night', startHour: 22, startMin: 0, endHour: 6,  endMin: 0 };

    const utcHour = (h: number, m = 0) => {
        const d = new Date(0);
        d.setUTCHours(h, m, 0, 0);
        return d;
    };

    it('7:00 UTC is in day shift [06:00-14:00]', () => {
        expect(isInShiftWindow(utcHour(7), [dayShift])).toBe(true);
    });

    it('6:00 UTC is on boundary — inside day shift (inclusive start)', () => {
        expect(isInShiftWindow(utcHour(6), [dayShift])).toBe(true);
    });

    it('14:00 UTC is outside day shift (exclusive end)', () => {
        expect(isInShiftWindow(utcHour(14), [dayShift])).toBe(false);
    });

    it('23:00 UTC is in overnight shift [22:00-06:00]', () => {
        expect(isInShiftWindow(utcHour(23), [nightShift])).toBe(true);
    });

    it('2:00 UTC is in overnight shift [22:00-06:00]', () => {
        expect(isInShiftWindow(utcHour(2), [nightShift])).toBe(true);
    });

    it('10:00 UTC is outside overnight shift', () => {
        expect(isInShiftWindow(utcHour(10), [nightShift])).toBe(false);
    });

    it('multiple shifts — 10:00 matches if second shift covers it', () => {
        const swing: ShiftWindow = { name: 'Swing', startHour: 9, startMin: 0, endHour: 17, endMin: 0 };
        expect(isInShiftWindow(utcHour(10), [dayShift, swing])).toBe(true);
    });

    it('empty shift list → never in shift', () => {
        expect(isInShiftWindow(utcHour(10), [])).toBe(false);
    });
});

// ── hasMaintConflict ──────────────────────────────────────────────────────────

describe('hasMaintConflict', () => {
    const iso = (dateStr: string) => new Date(dateStr);

    const windows: MaintenanceWindow[] = [
        { start: '2026-01-10T00:00:00Z', end: '2026-01-10T04:00:00Z', label: 'Weekend PM' },
        { start: '2026-01-15T08:00:00Z', end: '2026-01-15T12:00:00Z', label: 'Preventive' },
    ];

    it('detects conflict when job overlaps maintenance window', () => {
        expect(hasMaintConflict(
            iso('2026-01-10T02:00:00Z'),
            iso('2026-01-10T05:00:00Z'),
            windows,
        )).toBe(true);
    });

    it('no conflict when job ends exactly at window start', () => {
        expect(hasMaintConflict(
            iso('2026-01-09T22:00:00Z'),
            iso('2026-01-10T00:00:00Z'),
            windows,
        )).toBe(false);
    });

    it('no conflict when job is entirely before window', () => {
        expect(hasMaintConflict(
            iso('2026-01-09T20:00:00Z'),
            iso('2026-01-09T23:00:00Z'),
            windows,
        )).toBe(false);
    });

    it('no conflict when job is entirely after all windows', () => {
        expect(hasMaintConflict(
            iso('2026-01-20T00:00:00Z'),
            iso('2026-01-20T08:00:00Z'),
            windows,
        )).toBe(false);
    });

    it('detects conflict with second maintenance window', () => {
        expect(hasMaintConflict(
            iso('2026-01-15T10:00:00Z'),
            iso('2026-01-15T14:00:00Z'),
            windows,
        )).toBe(true);
    });

    it('empty windows list → no conflict', () => {
        expect(hasMaintConflict(
            iso('2026-01-10T02:00:00Z'),
            iso('2026-01-10T05:00:00Z'),
            [],
        )).toBe(false);
    });
});

// ── calcAdherence ─────────────────────────────────────────────────────────────

describe('calcAdherence', () => {
    it('exactly on time → 100', () => {
        expect(calcAdherence(60, 60)).toBe(100);
    });

    it('finished early → 100 (capped)', () => {
        expect(calcAdherence(60, 45)).toBe(100);
    });

    it('10 minutes over planned 60 → 85.7%', () => {
        // 60/70 = 0.857… → round to 85.7
        expect(calcAdherence(60, 70)).toBeCloseTo(85.7, 0);
    });

    it('double the planned time → 50', () => {
        expect(calcAdherence(60, 120)).toBe(50);
    });

    it('zero planned → 0', () => {
        expect(calcAdherence(0, 60)).toBe(0);
    });

    it('zero actual → 100 (not started, assumed compliant)', () => {
        expect(calcAdherence(60, 0)).toBe(100);
    });

    it('very small planned → result not below 0', () => {
        const result = calcAdherence(1, 1_000);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
    });
});

// ── calcDrift ─────────────────────────────────────────────────────────────────

describe('calcDrift', () => {
    const base = new Date('2026-01-10T08:00:00Z');

    it('no drift when now is before plannedEnd', () => {
        const now = new Date(base.getTime() - 10 * 60_000);
        expect(calcDrift(base, now)).toBe(0);
    });

    it('no drift when now equals plannedEnd', () => {
        expect(calcDrift(base, base)).toBe(0);
    });

    it('30 minutes late → drift 30', () => {
        const now = new Date(base.getTime() + 30 * 60_000);
        expect(calcDrift(base, now)).toBe(30);
    });

    it('sub-minute drift (<30s) rounds to 0', () => {
        const now = new Date(base.getTime() + 20_000); // 20 seconds — rounds to 0
        expect(calcDrift(base, now)).toBe(0);
    });

    it('1 hour late → 60', () => {
        const now = new Date(base.getTime() + 60 * 60_000);
        expect(calcDrift(base, now)).toBe(60);
    });
});

// ── calcCapacityUtilization ───────────────────────────────────────────────────

describe('calcCapacityUtilization', () => {
    it('720 min used / 1440 available → 50%', () => {
        expect(calcCapacityUtilization(720, 1440)).toBe(50);
    });

    it('0 used → 0%', () => {
        expect(calcCapacityUtilization(0, 480)).toBe(0);
    });

    it('exactly full → 100%', () => {
        expect(calcCapacityUtilization(480, 480)).toBe(100);
    });

    it('over-scheduled is capped at 100%', () => {
        expect(calcCapacityUtilization(600, 480)).toBe(100);
    });

    it('zero available → 0%', () => {
        expect(calcCapacityUtilization(100, 0)).toBe(0);
    });

    it('fractional result rounds to 1 decimal', () => {
        // 100 / 480 = 20.833... → 20.8
        expect(calcCapacityUtilization(100, 480)).toBeCloseTo(20.8, 0);
    });
});

// ── findEarliestSlot ──────────────────────────────────────────────────────────

describe('findEarliestSlot', () => {
    const ms = (minutes: number) => minutes * 60_000;
    const t  = (iso: string) => new Date(iso);

    it('no bookings → slot starts at notBefore', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const slot = findEarliestSlot(notBefore, ms(60), []);
        expect(slot.start).toEqual(notBefore);
        expect(slot.end).toEqual(new Date(notBefore.getTime() + ms(60)));
    });

    it('single booking in the future → slot starts at notBefore before the booking', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const booked = [{ start: t('2026-01-10T10:00:00Z'), end: t('2026-01-10T12:00:00Z') }];
        // 60-min job fits in [08:00, 09:00] before booking at 10:00
        const slot = findEarliestSlot(notBefore, ms(60), booked);
        expect(slot.start).toEqual(notBefore);
    });

    it('booking starts at notBefore → slot pushed to after booking', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const booked = [{ start: t('2026-01-10T08:00:00Z'), end: t('2026-01-10T10:00:00Z') }];
        const slot = findEarliestSlot(notBefore, ms(60), booked);
        expect(slot.start).toEqual(t('2026-01-10T10:00:00Z'));
        expect(slot.end).toEqual(t('2026-01-10T11:00:00Z'));
    });

    it('two back-to-back bookings → slot after second', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const booked = [
            { start: t('2026-01-10T08:00:00Z'), end: t('2026-01-10T10:00:00Z') },
            { start: t('2026-01-10T10:00:00Z'), end: t('2026-01-10T12:00:00Z') },
        ];
        const slot = findEarliestSlot(notBefore, ms(60), booked);
        expect(slot.start).toEqual(t('2026-01-10T12:00:00Z'));
    });

    it('gap between bookings fits job → uses gap', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const booked = [
            { start: t('2026-01-10T08:00:00Z'), end: t('2026-01-10T09:00:00Z') },
            { start: t('2026-01-10T11:00:00Z'), end: t('2026-01-10T13:00:00Z') },
        ];
        // 90-min job: gap [09:00-11:00] = 120 min → fits
        const slot = findEarliestSlot(notBefore, ms(90), booked);
        expect(slot.start).toEqual(t('2026-01-10T09:00:00Z'));
        expect(slot.end).toEqual(t('2026-01-10T10:30:00Z'));
    });

    it('gap too small → skips to after later booking', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const booked = [
            { start: t('2026-01-10T08:00:00Z'), end: t('2026-01-10T09:00:00Z') },
            // gap of 30 min
            { start: t('2026-01-10T09:30:00Z'), end: t('2026-01-10T12:00:00Z') },
        ];
        // 60-min job won't fit in 30-min gap
        const slot = findEarliestSlot(notBefore, ms(60), booked);
        expect(slot.start).toEqual(t('2026-01-10T12:00:00Z'));
    });

    it('unsorted bookings are handled correctly', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const booked = [
            { start: t('2026-01-10T11:00:00Z'), end: t('2026-01-10T12:00:00Z') },
            { start: t('2026-01-10T08:00:00Z'), end: t('2026-01-10T10:00:00Z') },
        ];
        // Should sort and push to after 12:00 (no gap between 10:00-11:00 if job is 90 min)
        const slot60 = findEarliestSlot(notBefore, ms(60), booked);
        // gap [10:00-11:00] = 60 min — exactly fits
        expect(slot60.start).toEqual(t('2026-01-10T10:00:00Z'));
    });

    it('large gap at end → slot starts there', () => {
        const notBefore = t('2026-01-10T00:00:00Z');
        const booked = [
            { start: t('2026-01-10T00:00:00Z'), end: t('2026-01-10T20:00:00Z') },
        ];
        const slot = findEarliestSlot(notBefore, ms(120), booked);
        expect(slot.start).toEqual(t('2026-01-10T20:00:00Z'));
        expect(slot.end).toEqual(t('2026-01-10T22:00:00Z'));
    });

    it('does not modify the original booked array', () => {
        const notBefore = t('2026-01-10T08:00:00Z');
        const booked = [
            { start: t('2026-01-10T10:00:00Z'), end: t('2026-01-10T12:00:00Z') },
            { start: t('2026-01-10T08:00:00Z'), end: t('2026-01-10T09:00:00Z') },
        ];
        const originalOrder = booked.map(b => b.start.toISOString());
        findEarliestSlot(notBefore, ms(60), booked);
        expect(booked.map(b => b.start.toISOString())).toEqual(originalOrder);
    });
});

// ── Overlap prevention via detectOverlap + findEarliestSlot ──────────────────

describe('overlap prevention integration', () => {
    const t = (iso: string) => new Date(iso);
    const ms = (min: number) => min * 60_000;

    it('sequential jobs on same machine never overlap', () => {
        const notBefore = t('2026-01-10T06:00:00Z');
        const booked: Array<{ start: Date; end: Date }> = [];

        for (let i = 0; i < 5; i++) {
            const slot = findEarliestSlot(notBefore, ms(90), booked);
            // Verify no overlap with any already booked slot
            for (const b of booked) {
                expect(detectOverlap(slot, b)).toBe(false);
            }
            booked.push(slot);
        }
    });

    it('parallel jobs with same notBefore get different start times', () => {
        const notBefore = t('2026-01-10T06:00:00Z');
        const booked: Array<{ start: Date; end: Date }> = [];
        const slots: Array<{ start: Date; end: Date }> = [];

        for (let i = 0; i < 3; i++) {
            const slot = findEarliestSlot(notBefore, ms(60), booked);
            slots.push(slot);
            booked.push(slot);
        }

        // Each pair should not overlap
        for (let i = 0; i < slots.length; i++) {
            for (let j = i + 1; j < slots.length; j++) {
                expect(detectOverlap(slots[i], slots[j])).toBe(false);
            }
        }
    });
});

// ── Maintenance blocking integration ─────────────────────────────────────────

describe('maintenance blocking integration', () => {
    const t = (iso: string) => new Date(iso);
    const ms = (min: number) => min * 60_000;

    it('findEarliestSlot + hasMaintConflict: slot that overlaps maintenance gets flagged', () => {
        const notBefore = t('2026-01-10T07:00:00Z');
        const windows: MaintenanceWindow[] = [
            { start: '2026-01-10T07:00:00Z', end: '2026-01-10T09:00:00Z', label: 'Scheduled PM' },
        ];

        // No prior bookings — slot starts at 07:00 = overlaps maintenance
        const slot = findEarliestSlot(notBefore, ms(60), []);
        const hasConflict = hasMaintConflict(slot.start, slot.end, windows);
        expect(hasConflict).toBe(true);
    });

    it('slot after maintenance window has no conflict', () => {
        const notBefore = t('2026-01-10T07:00:00Z');
        const windows: MaintenanceWindow[] = [
            { start: '2026-01-10T07:00:00Z', end: '2026-01-10T09:00:00Z', label: 'Scheduled PM' },
        ];
        // Booking during maintenance forces cursor past it
        const booked = [{ start: t('2026-01-10T07:00:00Z'), end: t('2026-01-10T09:00:00Z') }];
        const slot = findEarliestSlot(notBefore, ms(60), booked);
        const hasConflict = hasMaintConflict(slot.start, slot.end, windows);
        expect(hasConflict).toBe(false);
    });
});

// ── Drift propagation (pure logic) ───────────────────────────────────────────

describe('drift propagation', () => {
    it('calcDrift propagates correctly to downstream schedule', () => {
        const plannedEnd = new Date('2026-01-10T10:00:00Z');
        const actualNow  = new Date('2026-01-10T10:45:00Z');
        const drift = calcDrift(plannedEnd, actualNow); // 45 min

        const downstream = {
            plannedStart: new Date('2026-01-10T10:00:00Z'),
            plannedEnd:   new Date('2026-01-10T12:00:00Z'),
        };
        const newStart = new Date(downstream.plannedStart.getTime() + drift * 60_000);
        const newEnd   = new Date(downstream.plannedEnd.getTime()   + drift * 60_000);

        expect(drift).toBe(45);
        expect(newStart).toEqual(new Date('2026-01-10T10:45:00Z'));
        expect(newEnd).toEqual(new Date('2026-01-10T12:45:00Z'));
    });

    it('no drift when job finishes on time — downstream unchanged', () => {
        const plannedEnd = new Date('2026-01-10T10:00:00Z');
        const actualNow  = new Date('2026-01-10T09:55:00Z');
        const drift = calcDrift(plannedEnd, actualNow);
        expect(drift).toBe(0);
    });

    it('cascade: drift from job A propagates to B and C', () => {
        const jobAPlannedEnd = new Date('2026-01-10T10:00:00Z');
        const now            = new Date('2026-01-10T11:00:00Z'); // 60 min late
        const drift          = calcDrift(jobAPlannedEnd, now);   // 60 min

        const downstream = [
            { plannedStart: new Date('2026-01-10T10:00:00Z'), plannedEnd: new Date('2026-01-10T12:00:00Z') },
            { plannedStart: new Date('2026-01-10T12:00:00Z'), plannedEnd: new Date('2026-01-10T14:00:00Z') },
        ];

        for (const ds of downstream) {
            const newStart = new Date(ds.plannedStart.getTime() + drift * 60_000);
            const newEnd   = new Date(ds.plannedEnd.getTime()   + drift * 60_000);
            // Each downstream job shifts by the same drift amount
            expect(newEnd.getTime() - newStart.getTime()).toBe(
                ds.plannedEnd.getTime() - ds.plannedStart.getTime()
            );
        }
        expect(drift).toBe(60);
    });
});
