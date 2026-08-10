/**
 * RealtimeService Tests
 *
 * All tests use mocked EventBus and MQTTService — no real broker/DB required.
 * Coverage:
 *   - broadcastMachineUpdate: EventBus + MQTT publish
 *   - broadcastMachineAlarm: EventBus + MQTT publish
 *   - broadcastWorkflowUpdate: EventBus + MQTT publish
 *   - broadcastInspectionUpdate: EventBus + MQTT publish
 *   - Payload shape and field propagation
 *   - Correct MQTT topics used per broadcast type
 *   - MQTT publish is called even when service returns false (disconnected)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock EventBus
vi.mock('@/lib/events/EventBus', () => ({
    eventBus: { publish: vi.fn(), subscribe: vi.fn(() => () => {}), on: vi.fn(), off: vi.fn() },
}));

// Mock MQTTService
vi.mock('@/lib/services/MQTTService', () => ({
    MQTTService: { publish: vi.fn(() => false) },
    MQTT_TOPICS: {
        MACHINE_STATUS:    'factory/machine/status',
        MACHINE_ALARM:     'factory/machine/alarm',
        PRODUCTION_UPDATE: 'factory/production/update',
        INSPECTION_UPDATE: 'factory/inspection/update',
    },
}));

import { RealtimeService } from '@/lib/services/RealtimeService';
import { eventBus } from '@/lib/events/EventBus';
import { MQTTService, MQTT_TOPICS } from '@/lib/services/MQTTService';

beforeEach(() => {
    vi.clearAllMocks();
});

// ── broadcastMachineUpdate ────────────────────────────────────────────────────

describe('RealtimeService.broadcastMachineUpdate', () => {
    it('publishes machine.status.changed to EventBus', () => {
        RealtimeService.broadcastMachineUpdate('mc-1', { status: 'RUNNING', oee: 85 });

        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'machine.status.changed', source: 'RealtimeService' }),
        );
    });

    it('includes machineId in EventBus event', () => {
        RealtimeService.broadcastMachineUpdate('mc-2', { status: 'IDLE' });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.machineId).toBe('mc-2');
    });

    it('payload contains machineId and all data fields', () => {
        RealtimeService.broadcastMachineUpdate('mc-3', { status: 'DOWN', oee: 10, temperature: 72.5 });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.payload).toMatchObject({ machineId: 'mc-3', status: 'DOWN', oee: 10, temperature: 72.5 });
    });

    it('publishes to MACHINE_STATUS MQTT topic', () => {
        RealtimeService.broadcastMachineUpdate('mc-4', { status: 'MAINTENANCE' });

        expect(MQTTService.publish).toHaveBeenCalledWith(
            MQTT_TOPICS.MACHINE_STATUS,
            expect.objectContaining({ machineId: 'mc-4', status: 'MAINTENANCE' }),
        );
    });

    it('MQTT publish is called even when MQTTService is disconnected (returns false)', () => {
        // MQTTService.publish is mocked to return false (disconnected)
        RealtimeService.broadcastMachineUpdate('mc-5', { status: 'RUNNING' });
        expect(MQTTService.publish).toHaveBeenCalledTimes(1);
    });

    it('optional code field is forwarded in payload', () => {
        RealtimeService.broadcastMachineUpdate('mc-6', { status: 'RUNNING', code: 'CNC-01' });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.payload.code).toBe('CNC-01');
    });
});

// ── broadcastMachineAlarm ─────────────────────────────────────────────────────

describe('RealtimeService.broadcastMachineAlarm', () => {
    it('publishes machine.alarm to EventBus', () => {
        RealtimeService.broadcastMachineAlarm('mc-1', 'OVERHEAT');

        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'machine.alarm', source: 'RealtimeService' }),
        );
    });

    it('includes machineId in EventBus alarm event', () => {
        RealtimeService.broadcastMachineAlarm('mc-2', 'E01');

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.machineId).toBe('mc-2');
    });

    it('alarm payload contains machineId and alarmCode', () => {
        RealtimeService.broadcastMachineAlarm('mc-3', 'VIBRATION_HIGH');

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.payload).toMatchObject({ machineId: 'mc-3', alarmCode: 'VIBRATION_HIGH' });
    });

    it('alarm payload includes timestamp string', () => {
        RealtimeService.broadcastMachineAlarm('mc-4', 'FAULT');

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(typeof call.payload.timestamp).toBe('string');
    });

    it('publishes to MACHINE_ALARM MQTT topic', () => {
        RealtimeService.broadcastMachineAlarm('mc-5', 'LOW_OIL');

        expect(MQTTService.publish).toHaveBeenCalledWith(
            MQTT_TOPICS.MACHINE_ALARM,
            expect.objectContaining({ machineId: 'mc-5', alarmCode: 'LOW_OIL' }),
        );
    });

    it('forwards extra details into payload', () => {
        RealtimeService.broadcastMachineAlarm('mc-6', 'BEARING_WEAR', { severity: 'CRITICAL', rpm: 0 });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.payload).toMatchObject({ severity: 'CRITICAL', rpm: 0 });
    });
});

// ── broadcastWorkflowUpdate ───────────────────────────────────────────────────

describe('RealtimeService.broadcastWorkflowUpdate', () => {
    it('publishes order.created to EventBus', () => {
        RealtimeService.broadcastWorkflowUpdate('wo-1', { status: 'IN_PROGRESS' });

        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'order.created', source: 'RealtimeService' }),
        );
    });

    it('includes workOrderId in EventBus event', () => {
        RealtimeService.broadcastWorkflowUpdate('wo-2', { status: 'COMPLETED' });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.workOrderId).toBe('wo-2');
    });

    it('payload contains workOrderId and status', () => {
        RealtimeService.broadcastWorkflowUpdate('wo-3', { status: 'QC_PENDING', progress: 80 });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.payload).toMatchObject({ workOrderId: 'wo-3', status: 'QC_PENDING', progress: 80 });
    });

    it('publishes to PRODUCTION_UPDATE MQTT topic', () => {
        RealtimeService.broadcastWorkflowUpdate('wo-4', { status: 'APPROVED' });

        expect(MQTTService.publish).toHaveBeenCalledWith(
            MQTT_TOPICS.PRODUCTION_UPDATE,
            expect.objectContaining({ workOrderId: 'wo-4' }),
        );
    });
});

// ── broadcastInspectionUpdate ─────────────────────────────────────────────────

describe('RealtimeService.broadcastInspectionUpdate', () => {
    it('publishes quality.approved to EventBus', () => {
        RealtimeService.broadcastInspectionUpdate('sp-1', { entityType: 'PipeSpool', result: 'PASS' });

        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'quality.approved', source: 'RealtimeService' }),
        );
    });

    it('payload contains entityId, entityType, and result', () => {
        RealtimeService.broadcastInspectionUpdate('sp-2', { entityType: 'SpoolJoint', result: 'FAIL' });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.payload).toMatchObject({ entityId: 'sp-2', entityType: 'SpoolJoint', result: 'FAIL' });
    });

    it('publishes to INSPECTION_UPDATE MQTT topic', () => {
        RealtimeService.broadcastInspectionUpdate('sp-3', { entityType: 'PipeSpool', result: 'PASS' });

        expect(MQTTService.publish).toHaveBeenCalledWith(
            MQTT_TOPICS.INSPECTION_UPDATE,
            expect.objectContaining({ entityId: 'sp-3' }),
        );
    });

    it('optional inspectedBy field is forwarded', () => {
        RealtimeService.broadcastInspectionUpdate('sp-4', {
            entityType: 'PipeSpool', result: 'PASS', inspectedBy: 'Deepa.QC',
        });

        const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.payload.inspectedBy).toBe('Deepa.QC');
    });
});
