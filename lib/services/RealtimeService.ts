/**
 * RealtimeService
 *
 * Bridges the internal EventBus and the outbound MQTT layer.
 * All broadcast calls:
 *   1. Publish to EventBus (picked up by SSE /api/events)
 *   2. Publish to MQTT (if MQTTService is connected)
 *
 * This keeps the SSE endpoint event-driven instead of polling.
 */

import { eventBus } from '@/lib/events/EventBus';
import { MQTTService, MQTT_TOPICS } from './MQTTService';
import { createLogger } from '@/lib/logger';

const log = createLogger('RealtimeService');

// ── Broadcast payloads ────────────────────────────────────────────────────────

export interface MachineUpdatePayload {
    machineId: string;
    code?: string;
    status?: string;
    oee?: number;
    temperature?: number;
    cycleTime?: number;
    alarmCode?: string | null;
    [key: string]: unknown;
}

export interface WorkflowUpdatePayload {
    workOrderId: string;
    orderNumber?: string;
    status?: string;
    progress?: number;
    [key: string]: unknown;
}

export interface InspectionUpdatePayload {
    entityId: string;
    entityType?: string;
    result?: string;
    inspectedBy?: string;
    [key: string]: unknown;
}

// ── Service ───────────────────────────────────────────────────────────────────

class RealtimeServiceClass {
    private static instance: RealtimeServiceClass;

    private constructor() {}

    static getInstance(): RealtimeServiceClass {
        if (!RealtimeServiceClass.instance) {
            RealtimeServiceClass.instance = new RealtimeServiceClass();
        }
        return RealtimeServiceClass.instance;
    }

    // ── Machine updates ───────────────────────────────────────────────────────

    broadcastMachineUpdate(machineId: string, data: Omit<MachineUpdatePayload, 'machineId'>): void {
        const payload: MachineUpdatePayload = { machineId, ...data };

        eventBus.publish({
            type: 'machine.status.changed',
            source: 'RealtimeService',
            machineId,
            payload,
        });

        if (!MQTTService.publish(MQTT_TOPICS.MACHINE_STATUS, payload)) {
            log.warn('MQTT publish failed for machine status update', { machineId });
        }
    }

    broadcastMachineAlarm(machineId: string, alarmCode: string, details: Record<string, unknown> = {}): void {
        const payload = { machineId, alarmCode, ...details, timestamp: new Date().toISOString() };

        eventBus.publish({
            type: 'machine.alarm',
            source: 'RealtimeService',
            machineId,
            payload,
        });

        if (!MQTTService.publish(MQTT_TOPICS.MACHINE_ALARM, payload)) {
            log.warn('MQTT publish failed for machine alarm', { machineId, alarmCode });
        }
    }

    // ── Workflow/order updates ─────────────────────────────────────────────────

    broadcastWorkflowUpdate(workOrderId: string, data: Omit<WorkflowUpdatePayload, 'workOrderId'>): void {
        const payload: WorkflowUpdatePayload = { workOrderId, ...data };

        eventBus.publish({
            type: 'order.created',
            source: 'RealtimeService',
            workOrderId,
            payload,
        });

        if (!MQTTService.publish(MQTT_TOPICS.PRODUCTION_UPDATE, payload)) {
            log.warn('MQTT publish failed for workflow update', { workOrderId });
        }
    }

    // ── Inspection updates ─────────────────────────────────────────────────────

    broadcastInspectionUpdate(entityId: string, data: Omit<InspectionUpdatePayload, 'entityId'>): void {
        const payload: InspectionUpdatePayload = { entityId, ...data };

        eventBus.publish({
            type: 'quality.approved',
            source: 'RealtimeService',
            payload,
        });

        if (!MQTTService.publish(MQTT_TOPICS.INSPECTION_UPDATE, payload)) {
            log.warn('MQTT publish failed for inspection update', { entityId });
        }
    }
}

export const RealtimeService = RealtimeServiceClass.getInstance();
