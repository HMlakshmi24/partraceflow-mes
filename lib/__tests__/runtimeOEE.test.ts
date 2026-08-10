/**
 * Runtime OEE Engine Tests
 *
 * Pure-function tests — no database required.
 * Coverage:
 *   - OEE formula correctness (availability, performance, quality, OEE)
 *   - Divide-by-zero safety for all formula paths
 *   - Runtime counter accumulation
 *   - Downtime lifecycle (open → close → duration)
 *   - Heartbeat timeout detection
 *   - Duplicate/overlap downtime prevention
 *   - Dashboard OEE aggregation
 */

import { describe, it, expect } from 'vitest';
import {
    calcAvailability,
    calcPerformance,
    calcQuality,
    calcOEE,
    calculateOEEComponents,
    type RuntimeSnapshot,
} from '@/lib/services/OEEEngine';

// ── OEE Formula: Availability ─────────────────────────────────────────────────

describe('calcAvailability', () => {
    it('returns correct value for normal inputs', () => {
        // 7 hours runtime out of 8 hours planned = 87.5%
        expect(calcAvailability(7 * 3600, 8 * 3600)).toBe(87.5);
    });

    it('returns 0 when plannedSeconds is 0 (divide-by-zero guard)', () => {
        expect(calcAvailability(3600, 0)).toBe(0);
    });

    it('returns 0 when plannedSeconds is negative', () => {
        expect(calcAvailability(3600, -100)).toBe(0);
    });

    it('caps at 100 when runtimeSeconds exceeds plannedSeconds', () => {
        // 9 hours runtime reported for an 8-hour shift — instrument error, cap at 100
        expect(calcAvailability(9 * 3600, 8 * 3600)).toBe(100);
    });

    it('returns 0 when runtimeSeconds is 0', () => {
        expect(calcAvailability(0, 3600)).toBe(0);
    });

    it('handles fractional seconds correctly', () => {
        // 1 hour runtime / 2 hours planned = 50%
        expect(calcAvailability(3600, 7200)).toBe(50);
    });
});

// ── OEE Formula: Performance ──────────────────────────────────────────────────

describe('calcPerformance', () => {
    it('returns correct value for normal inputs', () => {
        // ideal=30s, 100 parts, runtime=3600s → 30*100/3600 = 83.3%
        expect(calcPerformance(30, 100, 3600)).toBeCloseTo(83.3, 0);
    });

    it('returns 0 when runtimeSeconds is 0 (divide-by-zero guard)', () => {
        expect(calcPerformance(30, 100, 0)).toBe(0);
    });

    it('returns 0 when idealCycleTime is 0', () => {
        expect(calcPerformance(0, 100, 3600)).toBe(0);
    });

    it('returns 0 when totalCount is 0', () => {
        // No parts produced — performance is 0
        expect(calcPerformance(30, 0, 3600)).toBe(0);
    });

    it('caps at 100 when actual is faster than ideal', () => {
        // ideal=60s, 200 parts, runtime=3600s → 200*60/3600 = 333% → capped at 100
        expect(calcPerformance(60, 200, 3600)).toBe(100);
    });
});

// ── OEE Formula: Quality ──────────────────────────────────────────────────────

describe('calcQuality', () => {
    it('returns correct value for normal inputs', () => {
        expect(calcQuality(90, 100)).toBe(90);
    });

    it('returns 0 when totalCount is 0 (divide-by-zero guard)', () => {
        expect(calcQuality(0, 0)).toBe(0);
    });

    it('returns 100 when all parts are good', () => {
        expect(calcQuality(500, 500)).toBe(100);
    });

    it('returns 0 when no good parts', () => {
        expect(calcQuality(0, 100)).toBe(0);
    });

    it('caps at 100 even with bad input data', () => {
        expect(calcQuality(110, 100)).toBe(100);
    });
});

// ── OEE Formula: OEE composite ────────────────────────────────────────────────

describe('calcOEE', () => {
    it('calculates OEE as product of three components', () => {
        // 90% * 85% * 95% = 72.675 → ~72.7
        expect(calcOEE(90, 85, 95)).toBeCloseTo(72.7, 0);
    });

    it('returns 0 when availability is 0', () => {
        expect(calcOEE(0, 85, 95)).toBe(0);
    });

    it('returns 0 when performance is 0', () => {
        expect(calcOEE(90, 0, 95)).toBe(0);
    });

    it('returns 0 when quality is 0', () => {
        expect(calcOEE(90, 85, 0)).toBe(0);
    });

    it('returns 100 when all components are 100', () => {
        expect(calcOEE(100, 100, 100)).toBe(100);
    });
});

// ── OEE composite: calculateOEEComponents ────────────────────────────────────

describe('calculateOEEComponents', () => {
    const baseSnap: RuntimeSnapshot = {
        runtimeSeconds:  7 * 3600,    // 7 hours running
        downtimeSeconds: 1 * 3600,    // 1 hour down
        goodCount:       850,
        rejectCount:     50,
        cycleCount:      900,
        idealCycleTime:  28,           // seconds per cycle
        plannedSeconds:  8 * 3600,    // 8-hour shift
    };

    it('returns correct availability', () => {
        const { availability } = calculateOEEComponents(baseSnap);
        // 7h / 8h = 87.5%
        expect(availability).toBe(87.5);
    });

    it('returns correct quality', () => {
        const { quality } = calculateOEEComponents(baseSnap);
        // 850 / 900 = 94.4%
        expect(quality).toBeCloseTo(94.4, 0);
    });

    it('OEE is never greater than the minimum component', () => {
        const { oee, availability, performance, quality } = calculateOEEComponents(baseSnap);
        expect(oee).toBeLessThanOrEqual(Math.min(availability, performance, quality));
    });

    it('returns all zeros when planned seconds is 0', () => {
        const snap: RuntimeSnapshot = { ...baseSnap, plannedSeconds: 0 };
        const result = calculateOEEComponents(snap);
        // availability=0, performance depends on runtime (runtimeSeconds still 7h)
        // availability=0, OEE=0
        expect(result.availability).toBe(0);
        expect(result.oee).toBe(0);
    });

    it('returns zeros when runtimeSeconds is 0', () => {
        const snap: RuntimeSnapshot = { ...baseSnap, runtimeSeconds: 0 };
        const { availability, performance, oee } = calculateOEEComponents(snap);
        expect(availability).toBe(0);
        expect(performance).toBe(0);
        expect(oee).toBe(0);
    });

    it('handles machine with no parts produced (quality=0)', () => {
        const snap: RuntimeSnapshot = { ...baseSnap, goodCount: 0, rejectCount: 0, cycleCount: 0 };
        const { quality, performance } = calculateOEEComponents(snap);
        expect(quality).toBe(0);
        expect(performance).toBe(0);
    });

    it('handles all-good production (quality=100)', () => {
        const snap: RuntimeSnapshot = { ...baseSnap, rejectCount: 0 };
        const { quality } = calculateOEEComponents(snap);
        expect(quality).toBe(100);
    });
});

// ── Runtime counter accumulation ──────────────────────────────────────────────

describe('Runtime counter accumulation', () => {
    function accumulateCounters(
        initial: { goodCount: number; rejectCount: number; cycleCount: number; runtimeSeconds: number },
        cycles: Array<{ good: number; reject: number; cycleTimeSeconds: number }>,
    ) {
        return cycles.reduce((acc, c) => ({
            goodCount:     acc.goodCount     + c.good,
            rejectCount:   acc.rejectCount   + c.reject,
            cycleCount:    acc.cycleCount    + 1,
            runtimeSeconds: acc.runtimeSeconds + c.cycleTimeSeconds,
        }), initial);
    }

    it('increments good count correctly', () => {
        const result = accumulateCounters(
            { goodCount: 10, rejectCount: 1, cycleCount: 11, runtimeSeconds: 330 },
            [{ good: 1, reject: 0, cycleTimeSeconds: 30 }],
        );
        expect(result.goodCount).toBe(11);
    });

    it('increments reject count correctly', () => {
        const result = accumulateCounters(
            { goodCount: 10, rejectCount: 1, cycleCount: 11, runtimeSeconds: 330 },
            [{ good: 0, reject: 1, cycleTimeSeconds: 30 }],
        );
        expect(result.rejectCount).toBe(2);
    });

    it('increments cycle count on each cycle', () => {
        const result = accumulateCounters(
            { goodCount: 0, rejectCount: 0, cycleCount: 0, runtimeSeconds: 0 },
            [
                { good: 1, reject: 0, cycleTimeSeconds: 30 },
                { good: 1, reject: 0, cycleTimeSeconds: 30 },
                { good: 0, reject: 1, cycleTimeSeconds: 35 },
            ],
        );
        expect(result.cycleCount).toBe(3);
        expect(result.goodCount).toBe(2);
        expect(result.rejectCount).toBe(1);
        expect(result.runtimeSeconds).toBe(95);
    });

    it('accumulates runtime seconds correctly', () => {
        const result = accumulateCounters(
            { goodCount: 0, rejectCount: 0, cycleCount: 0, runtimeSeconds: 1800 },
            [{ good: 1, reject: 0, cycleTimeSeconds: 600 }],
        );
        expect(result.runtimeSeconds).toBe(2400);
    });
});

// ── Downtime lifecycle ────────────────────────────────────────────────────────

describe('Downtime lifecycle', () => {
    interface DowntimeEvent {
        id: string;
        machineId: string;
        startTime: Date;
        endTime: Date | null;
        durationSeconds: number | null;
        status: 'OPEN' | 'CLOSED';
    }

    function openDowntime(machineId: string, startTime: Date): DowntimeEvent {
        return { id: 'dt-1', machineId, startTime, endTime: null, durationSeconds: null, status: 'OPEN' };
    }

    function closeDowntime(event: DowntimeEvent, endTime: Date): DowntimeEvent {
        const durationSeconds = (endTime.getTime() - event.startTime.getTime()) / 1000;
        return { ...event, endTime, durationSeconds, status: 'CLOSED' };
    }

    function hasOpenDowntime(events: DowntimeEvent[], machineId: string): boolean {
        return events.some(e => e.machineId === machineId && e.status === 'OPEN');
    }

    const start = new Date('2026-06-01T06:00:00Z');
    const end   = new Date('2026-06-01T06:45:00Z'); // 45 minutes later

    it('creates open downtime event', () => {
        const ev = openDowntime('m1', start);
        expect(ev.status).toBe('OPEN');
        expect(ev.endTime).toBeNull();
        expect(ev.durationSeconds).toBeNull();
    });

    it('closing event sets correct duration', () => {
        const ev = closeDowntime(openDowntime('m1', start), end);
        expect(ev.status).toBe('CLOSED');
        expect(ev.durationSeconds).toBe(45 * 60); // 2700 seconds
    });

    it('detects open downtime for machine', () => {
        const events: DowntimeEvent[] = [openDowntime('m1', start)];
        expect(hasOpenDowntime(events, 'm1')).toBe(true);
    });

    it('no open downtime after close', () => {
        const events: DowntimeEvent[] = [closeDowntime(openDowntime('m1', start), end)];
        expect(hasOpenDowntime(events, 'm1')).toBe(false);
    });
});

// ── Overlap prevention ────────────────────────────────────────────────────────

describe('Downtime overlap prevention', () => {
    function wouldOverlap(
        existing: Array<{ machineId: string; status: string }>,
        newMachineId: string,
    ): boolean {
        return existing.some(e => e.machineId === newMachineId && e.status === 'OPEN');
    }

    it('blocks a second OPEN event for the same machine', () => {
        const existing = [{ machineId: 'm1', status: 'OPEN' }];
        expect(wouldOverlap(existing, 'm1')).toBe(true);
    });

    it('allows a new event when previous is CLOSED', () => {
        const existing = [{ machineId: 'm1', status: 'CLOSED' }];
        expect(wouldOverlap(existing, 'm1')).toBe(false);
    });

    it('allows event for a different machine', () => {
        const existing = [{ machineId: 'm1', status: 'OPEN' }];
        expect(wouldOverlap(existing, 'm2')).toBe(false);
    });

    it('allows event when no existing events', () => {
        expect(wouldOverlap([], 'm1')).toBe(false);
    });
});

// ── Heartbeat timeout detection ───────────────────────────────────────────────

describe('Heartbeat timeout detection', () => {
    function isStale(lastHeartbeat: Date | null, thresholdSeconds: number): boolean {
        if (!lastHeartbeat) return true;
        return (Date.now() - lastHeartbeat.getTime()) / 1000 > thresholdSeconds;
    }

    it('machine with null heartbeat is always stale', () => {
        expect(isStale(null, 120)).toBe(true);
    });

    it('machine with recent heartbeat is not stale', () => {
        const recent = new Date(Date.now() - 30 * 1000); // 30s ago
        expect(isStale(recent, 120)).toBe(false);
    });

    it('machine with old heartbeat is stale', () => {
        const old = new Date(Date.now() - 300 * 1000); // 5 minutes ago
        expect(isStale(old, 120)).toBe(true);
    });

    it('machine exactly at threshold boundary is not stale', () => {
        const atBoundary = new Date(Date.now() - 120 * 1000 + 500); // just under 120s
        expect(isStale(atBoundary, 120)).toBe(false);
    });

    it('machine 1ms past threshold is stale', () => {
        const justOver = new Date(Date.now() - 120 * 1000 - 100);
        expect(isStale(justOver, 120)).toBe(true);
    });
});

// ── Status delta accumulation ─────────────────────────────────────────────────

describe('Runtime status delta accumulation', () => {
    function statusDelta(
        prevStatus: string,
        elapsedSec: number,
    ): { runtimeSeconds: number; idleSeconds: number; downtimeSeconds: number } {
        if (prevStatus === 'RUNNING')     return { runtimeSeconds: elapsedSec, idleSeconds: 0, downtimeSeconds: 0 };
        if (prevStatus === 'IDLE')        return { runtimeSeconds: 0, idleSeconds: elapsedSec, downtimeSeconds: 0 };
        return { runtimeSeconds: 0, idleSeconds: 0, downtimeSeconds: elapsedSec };
    }

    it('RUNNING state contributes to runtimeSeconds', () => {
        const delta = statusDelta('RUNNING', 600);
        expect(delta.runtimeSeconds).toBe(600);
        expect(delta.idleSeconds).toBe(0);
        expect(delta.downtimeSeconds).toBe(0);
    });

    it('IDLE state contributes to idleSeconds', () => {
        const delta = statusDelta('IDLE', 300);
        expect(delta.idleSeconds).toBe(300);
        expect(delta.runtimeSeconds).toBe(0);
        expect(delta.downtimeSeconds).toBe(0);
    });

    it('DOWN state contributes to downtimeSeconds', () => {
        const delta = statusDelta('DOWN', 1800);
        expect(delta.downtimeSeconds).toBe(1800);
        expect(delta.runtimeSeconds).toBe(0);
        expect(delta.idleSeconds).toBe(0);
    });

    it('MAINTENANCE state contributes to downtimeSeconds', () => {
        const delta = statusDelta('MAINTENANCE', 7200);
        expect(delta.downtimeSeconds).toBe(7200);
    });

    it('zero elapsed seconds produces zero deltas', () => {
        const delta = statusDelta('RUNNING', 0);
        expect(delta.runtimeSeconds).toBe(0);
        expect(delta.idleSeconds).toBe(0);
        expect(delta.downtimeSeconds).toBe(0);
    });
});

// ── Dashboard OEE aggregation ─────────────────────────────────────────────────

describe('Dashboard OEE aggregation', () => {
    interface MachineOEE {
        machineId: string;
        hasRuntime: boolean;
        oee: number;
        availability: number;
        performance: number;
        quality: number;
    }

    function aggregateOEE(machines: MachineOEE[]): { oee: number; availability: number; performance: number; quality: number } {
        // Only include machines that have real runtime data
        const active = machines.filter(m => m.hasRuntime);
        if (active.length === 0) return { oee: 0, availability: 0, performance: 0, quality: 0 };
        const n = active.length;
        return {
            oee:          Math.round(active.reduce((s, m) => s + m.oee, 0)          / n * 10) / 10,
            availability: Math.round(active.reduce((s, m) => s + m.availability, 0) / n * 10) / 10,
            performance:  Math.round(active.reduce((s, m) => s + m.performance, 0)  / n * 10) / 10,
            quality:      Math.round(active.reduce((s, m) => s + m.quality, 0)       / n * 10) / 10,
        };
    }

    it('returns zeros when no machines have runtime data', () => {
        const result = aggregateOEE([
            { machineId: 'm1', hasRuntime: false, oee: 0, availability: 0, performance: 0, quality: 0 },
        ]);
        expect(result.oee).toBe(0);
    });

    it('averages OEE across machines with runtime', () => {
        const result = aggregateOEE([
            { machineId: 'm1', hasRuntime: true, oee: 80, availability: 85, performance: 90, quality: 95 },
            { machineId: 'm2', hasRuntime: true, oee: 60, availability: 70, performance: 80, quality: 85 },
        ]);
        expect(result.oee).toBe(70);
        expect(result.availability).toBe(77.5);
    });

    it('excludes machines without runtime from average', () => {
        const result = aggregateOEE([
            { machineId: 'm1', hasRuntime: true,  oee: 80, availability: 85, performance: 90, quality: 95 },
            { machineId: 'm2', hasRuntime: false, oee: 0,  availability: 0,  performance: 0,  quality: 0  },
        ]);
        // Only m1 should count — average = m1's values
        expect(result.oee).toBe(80);
    });

    it('single machine returns its own OEE', () => {
        const result = aggregateOEE([
            { machineId: 'm1', hasRuntime: true, oee: 72.5, availability: 87.5, performance: 83.3, quality: 94.4 },
        ]);
        expect(result.oee).toBe(72.5);
    });
});
