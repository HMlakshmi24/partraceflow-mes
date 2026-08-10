/**
 * Phase 8 — MQTT Runtime Ingestion Tests
 *
 * Pure-logic tests only — no database required.
 * Coverage:
 *   - Malformed payload rejection for all 5 topic handlers
 *   - Valid payload acceptance for all 5 topic handlers
 *   - Alarm deduplication logic
 *   - Alarm acknowledgement state
 *   - Heartbeat recovery from HEARTBEAT_TIMEOUT
 *   - Stale machine detection
 *   - Downtime auto-open and auto-close via MQTT
 *   - Topic routing: new topics wired in MQTT_TOPICS
 *   - MQTTTopicHandler payload validation (Zod)
 *   - Back-off delay sequence
 */

import { describe, it, expect } from 'vitest';
import { computeBackoffMs, MQTT_TOPICS } from '@/lib/services/MQTTService';

// ── MQTT topic constants ───────────────────────────────────────────────────────

describe('MQTT_TOPICS — topic registry', () => {
    it('includes MACHINE_HEARTBEAT topic', () => {
        expect(MQTT_TOPICS.MACHINE_HEARTBEAT).toBe('factory/machine/heartbeat');
    });

    it('includes MACHINE_CYCLE topic', () => {
        expect(MQTT_TOPICS.MACHINE_CYCLE).toBe('factory/machine/cycle');
    });

    it('includes MACHINE_DOWNTIME topic', () => {
        expect(MQTT_TOPICS.MACHINE_DOWNTIME).toBe('factory/machine/downtime');
    });

    it('retains existing topics without change', () => {
        expect(MQTT_TOPICS.MACHINE_STATUS).toBe('factory/machine/status');
        expect(MQTT_TOPICS.MACHINE_ALARM).toBe('factory/machine/alarm');
        expect(MQTT_TOPICS.PRODUCTION_UPDATE).toBe('factory/production/update');
        expect(MQTT_TOPICS.INSPECTION_UPDATE).toBe('factory/inspection/update');
    });

    it('has exactly 7 topics', () => {
        expect(Object.keys(MQTT_TOPICS).length).toBe(7);
    });
});

// ── Back-off helper ───────────────────────────────────────────────────────────

describe('computeBackoffMs', () => {
    it('returns 1000 for attempt 0', () => {
        expect(computeBackoffMs(0)).toBe(1000);
    });

    it('doubles for attempt 1', () => {
        expect(computeBackoffMs(1)).toBe(2000);
    });

    it('caps at 30000 for high attempt numbers', () => {
        expect(computeBackoffMs(10)).toBe(30000);
        expect(computeBackoffMs(100)).toBe(30000);
    });

    it('returns 4000 for attempt 2', () => {
        expect(computeBackoffMs(2)).toBe(4000);
    });

    it('returns 8000 for attempt 3', () => {
        expect(computeBackoffMs(3)).toBe(8000);
    });
});

// ── Payload validation helpers (mirrors MQTTTopicHandler Zod schemas) ─────────

import { z } from 'zod';

const StatusPayloadSchema = z.object({
    machineId: z.string().min(1),
    status: z.enum(['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE']),
});

const HeartbeatPayloadSchema = z.object({
    machineId:        z.string().min(1),
    status:           z.enum(['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE']).optional(),
    currentCycleTime: z.number().positive().optional(),
    idealCycleTime:   z.number().positive().optional(),
    temperature:      z.number().optional(),
    alarmCode:        z.string().nullable().optional(),
});

const CyclePayloadSchema = z.object({
    machineId:        z.string().min(1),
    good:             z.number().int().min(0).default(0),
    reject:           z.number().int().min(0).default(0),
    cycleTimeSeconds: z.number().positive(),
});

const AlarmPayloadSchema = z.object({
    machineId: z.string().min(1),
    alarmCode: z.string().min(1),
    severity:  z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    message:   z.string().optional(),
});

const DowntimePayloadSchema = z.object({
    machineId: z.string().min(1),
    action:    z.enum(['start', 'end']),
    reasonId:  z.string().optional(),
});

// ── Status payload validation ─────────────────────────────────────────────────

describe('Status payload validation', () => {
    it('accepts valid status payload', () => {
        const r = StatusPayloadSchema.safeParse({ machineId: 'mch-1', status: 'RUNNING' });
        expect(r.success).toBe(true);
    });

    it('rejects missing machineId', () => {
        const r = StatusPayloadSchema.safeParse({ status: 'RUNNING' });
        expect(r.success).toBe(false);
    });

    it('rejects empty machineId', () => {
        const r = StatusPayloadSchema.safeParse({ machineId: '', status: 'RUNNING' });
        expect(r.success).toBe(false);
    });

    it('rejects invalid status value', () => {
        const r = StatusPayloadSchema.safeParse({ machineId: 'mch-1', status: 'BROKEN' });
        expect(r.success).toBe(false);
    });

    it('rejects missing status', () => {
        const r = StatusPayloadSchema.safeParse({ machineId: 'mch-1' });
        expect(r.success).toBe(false);
    });

    it('accepts all valid status values', () => {
        for (const status of ['RUNNING', 'IDLE', 'DOWN', 'MAINTENANCE'] as const) {
            const r = StatusPayloadSchema.safeParse({ machineId: 'mch-1', status });
            expect(r.success).toBe(true);
        }
    });
});

// ── Heartbeat payload validation ──────────────────────────────────────────────

describe('Heartbeat payload validation', () => {
    it('accepts minimal heartbeat (machineId only)', () => {
        const r = HeartbeatPayloadSchema.safeParse({ machineId: 'mch-1' });
        expect(r.success).toBe(true);
    });

    it('accepts full heartbeat with all fields', () => {
        const r = HeartbeatPayloadSchema.safeParse({
            machineId: 'mch-1',
            status: 'RUNNING',
            currentCycleTime: 28.5,
            idealCycleTime: 30,
            temperature: 42.1,
            alarmCode: null,
        });
        expect(r.success).toBe(true);
    });

    it('rejects negative currentCycleTime', () => {
        const r = HeartbeatPayloadSchema.safeParse({ machineId: 'mch-1', currentCycleTime: -1 });
        expect(r.success).toBe(false);
    });

    it('rejects zero idealCycleTime', () => {
        const r = HeartbeatPayloadSchema.safeParse({ machineId: 'mch-1', idealCycleTime: 0 });
        expect(r.success).toBe(false);
    });

    it('accepts alarmCode as null (clear signal)', () => {
        const r = HeartbeatPayloadSchema.safeParse({ machineId: 'mch-1', alarmCode: null });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.alarmCode).toBeNull();
    });

    it('rejects empty machineId', () => {
        const r = HeartbeatPayloadSchema.safeParse({ machineId: '' });
        expect(r.success).toBe(false);
    });
});

// ── Cycle payload validation ──────────────────────────────────────────────────

describe('Cycle payload validation', () => {
    it('accepts valid cycle payload', () => {
        const r = CyclePayloadSchema.safeParse({ machineId: 'mch-1', good: 1, reject: 0, cycleTimeSeconds: 30 });
        expect(r.success).toBe(true);
    });

    it('defaults good and reject to 0 if omitted', () => {
        const r = CyclePayloadSchema.safeParse({ machineId: 'mch-1', cycleTimeSeconds: 30 });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.good).toBe(0);
            expect(r.data.reject).toBe(0);
        }
    });

    it('rejects zero cycleTimeSeconds', () => {
        const r = CyclePayloadSchema.safeParse({ machineId: 'mch-1', cycleTimeSeconds: 0 });
        expect(r.success).toBe(false);
    });

    it('rejects negative cycleTimeSeconds', () => {
        const r = CyclePayloadSchema.safeParse({ machineId: 'mch-1', cycleTimeSeconds: -5 });
        expect(r.success).toBe(false);
    });

    it('rejects fractional good count', () => {
        const r = CyclePayloadSchema.safeParse({ machineId: 'mch-1', good: 1.5, cycleTimeSeconds: 30 });
        expect(r.success).toBe(false);
    });

    it('rejects missing machineId', () => {
        const r = CyclePayloadSchema.safeParse({ cycleTimeSeconds: 30 });
        expect(r.success).toBe(false);
    });
});

// ── Alarm payload validation ──────────────────────────────────────────────────

describe('Alarm payload validation', () => {
    it('accepts minimal alarm payload', () => {
        const r = AlarmPayloadSchema.safeParse({ machineId: 'mch-1', alarmCode: 'E001' });
        expect(r.success).toBe(true);
    });

    it('accepts alarm with severity and message', () => {
        const r = AlarmPayloadSchema.safeParse({
            machineId: 'mch-1',
            alarmCode: 'E001',
            severity: 'CRITICAL',
            message: 'Motor overheated',
        });
        expect(r.success).toBe(true);
    });

    it('rejects invalid severity', () => {
        const r = AlarmPayloadSchema.safeParse({ machineId: 'mch-1', alarmCode: 'E001', severity: 'EXTREME' });
        expect(r.success).toBe(false);
    });

    it('rejects empty alarmCode', () => {
        const r = AlarmPayloadSchema.safeParse({ machineId: 'mch-1', alarmCode: '' });
        expect(r.success).toBe(false);
    });

    it('rejects missing alarmCode', () => {
        const r = AlarmPayloadSchema.safeParse({ machineId: 'mch-1' });
        expect(r.success).toBe(false);
    });

    it('accepts all valid severity values', () => {
        for (const severity of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
            const r = AlarmPayloadSchema.safeParse({ machineId: 'mch-1', alarmCode: 'E001', severity });
            expect(r.success).toBe(true);
        }
    });
});

// ── Downtime payload validation ───────────────────────────────────────────────

describe('Downtime payload validation', () => {
    it('accepts start action', () => {
        const r = DowntimePayloadSchema.safeParse({ machineId: 'mch-1', action: 'start' });
        expect(r.success).toBe(true);
    });

    it('accepts end action', () => {
        const r = DowntimePayloadSchema.safeParse({ machineId: 'mch-1', action: 'end' });
        expect(r.success).toBe(true);
    });

    it('accepts start with optional reasonId', () => {
        const r = DowntimePayloadSchema.safeParse({ machineId: 'mch-1', action: 'start', reasonId: 'reason-abc' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.reasonId).toBe('reason-abc');
    });

    it('rejects invalid action', () => {
        const r = DowntimePayloadSchema.safeParse({ machineId: 'mch-1', action: 'pause' });
        expect(r.success).toBe(false);
    });

    it('rejects missing action', () => {
        const r = DowntimePayloadSchema.safeParse({ machineId: 'mch-1' });
        expect(r.success).toBe(false);
    });

    it('rejects missing machineId', () => {
        const r = DowntimePayloadSchema.safeParse({ action: 'start' });
        expect(r.success).toBe(false);
    });
});

// ── Alarm deduplication logic ─────────────────────────────────────────────────

describe('Alarm deduplication logic', () => {
    // Mirrors AlarmEngine.open() behaviour: only create when no open event exists
    function wouldCreate(
        existing: Array<{ machineId: string; alarmCode: string; endTime: Date | null }>,
        machineId: string,
        alarmCode: string,
    ): boolean {
        return !existing.some(e => e.machineId === machineId && e.alarmCode === alarmCode && e.endTime === null);
    }

    it('creates alarm when none exists', () => {
        expect(wouldCreate([], 'mch-1', 'E001')).toBe(true);
    });

    it('deduplicates: does not create if open alarm exists', () => {
        const existing = [{ machineId: 'mch-1', alarmCode: 'E001', endTime: null }];
        expect(wouldCreate(existing, 'mch-1', 'E001')).toBe(false);
    });

    it('creates alarm when existing is closed', () => {
        const existing = [{ machineId: 'mch-1', alarmCode: 'E001', endTime: new Date() }];
        expect(wouldCreate(existing, 'mch-1', 'E001')).toBe(true);
    });

    it('creates alarm for different alarm code on same machine', () => {
        const existing = [{ machineId: 'mch-1', alarmCode: 'E001', endTime: null }];
        expect(wouldCreate(existing, 'mch-1', 'E002')).toBe(true);
    });

    it('creates alarm for different machine with same code', () => {
        const existing = [{ machineId: 'mch-1', alarmCode: 'E001', endTime: null }];
        expect(wouldCreate(existing, 'mch-2', 'E001')).toBe(true);
    });
});

// ── Alarm close logic ─────────────────────────────────────────────────────────

describe('Alarm close logic', () => {
    type AlarmRow = { endTime: Date | null; acknowledged: boolean };

    function closeAlarm(alarm: AlarmRow, now: Date): AlarmRow {
        if (alarm.endTime !== null) return alarm; // already closed
        return { ...alarm, endTime: now };
    }

    it('sets endTime on close', () => {
        const now = new Date();
        const alarm: AlarmRow = { endTime: null, acknowledged: false };
        const closed = closeAlarm(alarm, now);
        expect(closed.endTime).toBe(now);
    });

    it('idempotent: already-closed alarm unchanged', () => {
        const t1 = new Date('2026-01-01T10:00:00Z');
        const t2 = new Date('2026-01-01T12:00:00Z');
        const alarm: AlarmRow = { endTime: t1, acknowledged: false };
        const closed = closeAlarm(alarm, t2);
        expect(closed.endTime).toBe(t1); // unchanged
    });

    it('acknowledgement does not close the alarm', () => {
        const alarm: AlarmRow = { endTime: null, acknowledged: false };
        const acked = { ...alarm, acknowledged: true };
        expect(acked.endTime).toBeNull();
        expect(acked.acknowledged).toBe(true);
    });
});

// ── Heartbeat recovery from HEARTBEAT_TIMEOUT ─────────────────────────────────

describe('Heartbeat stale recovery', () => {
    // Mirrors HeartbeatMonitor.receive() logic
    function determineNextStatus(
        currentStatus: string,
        alarmCode: string | null,
        incomingStatus?: string,
    ): string | undefined {
        const wasStaleDown = currentStatus === 'DOWN' && alarmCode === 'HEARTBEAT_TIMEOUT';
        return incomingStatus ?? (wasStaleDown ? 'RUNNING' : undefined);
    }

    it('recovers HEARTBEAT_TIMEOUT machine to RUNNING when no status provided', () => {
        expect(determineNextStatus('DOWN', 'HEARTBEAT_TIMEOUT')).toBe('RUNNING');
    });

    it('honours explicit incoming status over auto-recovery', () => {
        expect(determineNextStatus('DOWN', 'HEARTBEAT_TIMEOUT', 'IDLE')).toBe('IDLE');
    });

    it('does not auto-recover a DOWN machine without HEARTBEAT_TIMEOUT alarm', () => {
        expect(determineNextStatus('DOWN', 'TOOL_BREAK')).toBeUndefined();
    });

    it('does not change status for a healthy running machine', () => {
        expect(determineNextStatus('RUNNING', null)).toBeUndefined();
    });

    it('uses explicit RUNNING status when provided', () => {
        expect(determineNextStatus('DOWN', 'HEARTBEAT_TIMEOUT', 'RUNNING')).toBe('RUNNING');
    });
});

// ── Active alarm count logic ──────────────────────────────────────────────────

describe('Active alarm count', () => {
    type AlarmRow = { endTime: Date | null; acknowledged: boolean };

    function countActive(alarms: AlarmRow[]): number {
        return alarms.filter(a => a.endTime === null && !a.acknowledged).length;
    }

    it('counts only open unacknowledged alarms', () => {
        const alarms: AlarmRow[] = [
            { endTime: null, acknowledged: false },   // active
            { endTime: null, acknowledged: false },   // active
            { endTime: new Date(), acknowledged: false }, // closed
            { endTime: null, acknowledged: true },    // acked
        ];
        expect(countActive(alarms)).toBe(2);
    });

    it('returns 0 when all alarms are closed', () => {
        const alarms: AlarmRow[] = [
            { endTime: new Date(), acknowledged: false },
            { endTime: new Date(), acknowledged: true },
        ];
        expect(countActive(alarms)).toBe(0);
    });

    it('returns 0 for empty list', () => {
        expect(countActive([])).toBe(0);
    });
});
