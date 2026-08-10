/**
 * MQTTService
 *
 * Singleton MQTT integration layer for the MES.
 * Handles connect/subscribe/publish/disconnect with:
 *   - Exponential back-off reconnect (1 → 2 → 4 → 8 → 30 s cap)
 *   - JSON-only payloads (non-JSON messages are dropped and logged)
 *   - Typed topic routing for factory topics
 *
 * In demo/test environments the service runs in DISCONNECTED state and
 * publish() calls are no-ops — the rest of the system (RealtimeService,
 * DemoService) continues to function via EventBus.
 */

import { EventEmitter } from 'events';
import { eventBus } from '@/lib/events/EventBus';
import { ErrorTrackingService } from '@/lib/services/ErrorTrackingService';
import { MQTTTopicHandler } from '@/lib/services/MQTTTopicHandler';
import { createLogger } from '@/lib/logger';

const log = createLogger('MQTTService');

// ── Topic constants ────────────────────────────────────────────────────────────

export const MQTT_TOPICS = {
    MACHINE_STATUS:     'factory/machine/status',
    MACHINE_ALARM:      'factory/machine/alarm',
    MACHINE_HEARTBEAT:  'factory/machine/heartbeat',
    MACHINE_CYCLE:      'factory/machine/cycle',
    MACHINE_DOWNTIME:   'factory/machine/downtime',
    PRODUCTION_UPDATE:  'factory/production/update',
    INSPECTION_UPDATE:  'factory/inspection/update',
} as const;

export type MQTTTopicKey = keyof typeof MQTT_TOPICS;
export type MQTTTopic = typeof MQTT_TOPICS[MQTTTopicKey];

// ── Types ─────────────────────────────────────────────────────────────────────

export type MQTTConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

export interface MQTTPayload {
    [key: string]: unknown;
}

export interface MQTTMessage {
    topic: string;
    payload: MQTTPayload;
    receivedAt: Date;
}

export type MQTTMessageHandler = (message: MQTTMessage) => void;

export interface MQTTConnectOptions {
    clientId?: string;
    username?: string;
    password?: string;
    keepalive?: number;
    connectTimeout?: number;
}

interface MQTTClientLike {
    on(event: 'connect', handler: () => void): void;
    on(event: 'message', handler: (topic: string, rawPayload: Buffer) => void): void;
    on(event: 'error', handler: (err: Error) => void): void;
    on(event: 'close', handler: () => void): void;
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    publish(topic: string, payload: string, options: { qos: number }): void;
    end(force?: boolean): void;
}

// ── Back-off helper ───────────────────────────────────────────────────────────

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 30000];

export function computeBackoffMs(attempt: number): number {
    const idx = Math.min(attempt, BACKOFF_STEPS_MS.length - 1);
    return BACKOFF_STEPS_MS[idx];
}

// ── Service ───────────────────────────────────────────────────────────────────

class MQTTServiceClass extends EventEmitter {
    private static instance: MQTTServiceClass;

    private _state: MQTTConnectionState = 'DISCONNECTED';
    private _brokerUrl: string | null = null;
    private _reconnectAttempt = 0;
    private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private _subscriptions = new Map<string, Set<MQTTMessageHandler>>();

    // Real mqtt.Client is injected via connect(); null in demo/test mode.
    private _client: MQTTClientLike | null = null;
    private _failedPublishes: Array<{ topic: string; payload: MQTTPayload; failedAt: Date }> = [];

    private constructor() {
        super();
        this.setMaxListeners(50);
    }

    static getInstance(): MQTTServiceClass {
        if (!MQTTServiceClass.instance) {
            MQTTServiceClass.instance = new MQTTServiceClass();
        }
        return MQTTServiceClass.instance;
    }

    // ── State ──────────────────────────────────────────────────────────────────

    get state(): MQTTConnectionState { return this._state; }
    get isConnected(): boolean { return this._state === 'CONNECTED'; }
    get reconnectAttempt(): number { return this._reconnectAttempt; }

    private _setState(next: MQTTConnectionState): void {
        const prev = this._state;
        this._state = next;
        if (prev !== next) this.emit('stateChange', { prev, next });
    }

    // ── Connect ────────────────────────────────────────────────────────────────

    async connect(brokerUrl: string, opts: MQTTConnectOptions = {}): Promise<void> {
        if (this._state === 'CONNECTED' || this._state === 'CONNECTING') return;

        this._brokerUrl = brokerUrl;
        this._reconnectAttempt = 0;
        this._setState('CONNECTING');

        await this._doConnect(opts);
    }

    private async _doConnect(opts: MQTTConnectOptions): Promise<void> {
        if (!this._brokerUrl) return;

        try {
            // Dynamic import so the service can be imported in test environments
            // without the mqtt package actually connecting anywhere.
            const mqtt = await import('mqtt');
            const client = mqtt.default.connect(this._brokerUrl, {
                clientId:       opts.clientId ?? `mes-${Date.now()}`,
                username:       opts.username,
                password:       opts.password,
                keepalive:      opts.keepalive ?? 60,
                connectTimeout: opts.connectTimeout ?? 5000,
                reconnectPeriod: 0, // we manage reconnect ourselves
            });

            this._client = client;

            client.on('connect', () => {
                this._reconnectAttempt = 0;
                this._setState('CONNECTED');
                this.emit('connected');

                // Re-subscribe after reconnect
                for (const topic of this._subscriptions.keys()) {
                    client.subscribe(topic);
                }
            });

            client.on('message', (topic: string, rawPayload: Buffer) => {
                this._handleRawMessage(topic, rawPayload);
            });

            client.on('error', (err: Error) => {
                this.emit('error', err);
                void ErrorTrackingService.captureException('MQTTService', err, 'HIGH');
                this._handleDisconnect(opts);
            });

            client.on('close', () => {
                if (this._state === 'CONNECTED' || this._state === 'CONNECTING') {
                    this._handleDisconnect(opts);
                }
            });
        } catch {
            void ErrorTrackingService.capture({
                service: 'MQTTService',
                severity: 'HIGH',
                message: 'MQTT connection bootstrap failed',
            });
            this._handleDisconnect(opts);
        }
    }

    private _handleDisconnect(opts: MQTTConnectOptions): void {
        if (this._state === 'DISCONNECTED') return;

        this._client = null;
        this._reconnectAttempt += 1;
        const delay = computeBackoffMs(this._reconnectAttempt - 1);
        this._setState('RECONNECTING');
        this.emit('reconnecting', { attempt: this._reconnectAttempt, delayMs: delay });

        this._reconnectTimer = setTimeout(() => {
            this._setState('CONNECTING');
            this._doConnect(opts).catch(() => {});
        }, delay);
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    /**
     * Connects to MQTT_BROKER_URL (if configured) and subscribes the standard
     * inbound factory topics to their handlers. Called once from
     * instrumentation.ts at server startup. No-op if MQTT_BROKER_URL is unset
     * (the app continues to run in disconnected/demo mode via EventBus).
     * Safe to call more than once — connect()/subscribe() are both idempotent.
     */
    async bootstrap(): Promise<void> {
        const brokerUrl = process.env.MQTT_BROKER_URL;
        if (!brokerUrl) return;

        const { MQTTTopicHandler } = await import('@/lib/services/MQTTTopicHandler');

        this.subscribe(MQTT_TOPICS.MACHINE_STATUS, (msg) => { void MQTTTopicHandler.handleStatus(msg.payload); });
        this.subscribe(MQTT_TOPICS.MACHINE_HEARTBEAT, (msg) => { void MQTTTopicHandler.handleHeartbeat(msg.payload); });
        this.subscribe(MQTT_TOPICS.MACHINE_CYCLE, (msg) => { void MQTTTopicHandler.handleCycle(msg.payload); });
        this.subscribe(MQTT_TOPICS.MACHINE_ALARM, (msg) => { void MQTTTopicHandler.handleAlarm(msg.payload); });
        this.subscribe(MQTT_TOPICS.MACHINE_DOWNTIME, (msg) => { void MQTTTopicHandler.handleDowntime(msg.payload); });

        await this.connect(brokerUrl, {
            username: process.env.MQTT_USERNAME || undefined,
            password: process.env.MQTT_PASSWORD || undefined,
        });
    }

    // ── Disconnect ─────────────────────────────────────────────────────────────

    disconnect(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._client) {
            this._client.end(true);
            this._client = null;
        }
        this._setState('DISCONNECTED');
        this.emit('disconnected');
    }

    // ── Subscribe ──────────────────────────────────────────────────────────────

    subscribe(topic: string, handler: MQTTMessageHandler): () => void {
        if (!this._subscriptions.has(topic)) {
            this._subscriptions.set(topic, new Set());
            if (this._client && this.isConnected) {
                this._client.subscribe(topic);
            }
        }
        this._subscriptions.get(topic)!.add(handler);

        return () => this.unsubscribe(topic, handler);
    }

    unsubscribe(topic: string, handler: MQTTMessageHandler): void {
        const handlers = this._subscriptions.get(topic);
        if (!handlers) return;
        handlers.delete(handler);
        if (handlers.size === 0) {
            this._subscriptions.delete(topic);
            if (this._client && this.isConnected) {
                this._client.unsubscribe(topic);
            }
        }
    }

    // ── Publish ────────────────────────────────────────────────────────────────

    publish(topic: string, payload: MQTTPayload): boolean {
        if (!this._client || !this.isConnected) {
            this._failedPublishes.push({ topic, payload, failedAt: new Date() });
            return false;
        }

        let serialized: string;
        try {
            serialized = JSON.stringify(payload);
        } catch {
            log.error('publish: non-serialisable payload dropped', { topic });
            void ErrorTrackingService.capture({
                service: 'MQTTService',
                severity: 'MEDIUM',
                message: `MQTT publish serialization failed for topic ${topic}`,
            });
            return false;
        }

        try {
            this._client.publish(topic, serialized, { qos: 1 });
            return true;
        } catch (error) {
            this._failedPublishes.push({ topic, payload, failedAt: new Date() });
            void ErrorTrackingService.captureException('MQTTService', error, 'HIGH');
            return false;
        }
    }

    getFailedPublishCount(): number {
        return this._failedPublishes.length;
    }

    retryFailedPublishes(maxRetries = 100): number {
        if (!this._client || !this.isConnected || this._failedPublishes.length === 0) return 0;
        let retried = 0;
        const remaining: Array<{ topic: string; payload: MQTTPayload; failedAt: Date }> = [];
        for (const msg of this._failedPublishes) {
            if (retried >= maxRetries) {
                remaining.push(msg);
                continue;
            }
            const ok = this.publish(msg.topic, msg.payload);
            if (ok) retried += 1;
            else remaining.push(msg);
        }
        this._failedPublishes = remaining;
        return retried;
    }

    // ── Internal message routing ───────────────────────────────────────────────

    private _handleRawMessage(topic: string, rawPayload: Buffer): void {
        let parsed: MQTTPayload;
        try {
            parsed = JSON.parse(rawPayload.toString());
        } catch {
            log.warn('non-JSON message dropped', { topic });
            return;
        }

        const message: MQTTMessage = { topic, payload: parsed, receivedAt: new Date() };

        // Deliver to registered handlers
        const handlers = this._subscriptions.get(topic);
        if (handlers) {
            for (const h of handlers) {
                try { h(message); } catch (e) { log.error('handler error', { topic, message: e instanceof Error ? e.message : String(e) }); }
            }
        }

        // Route to EventBus so SSE and other listeners pick it up
        this._routeToEventBus(topic, parsed);
    }

    private _routeToEventBus(topic: string, payload: MQTTPayload): void {
        const machineId = String(payload.machineId ?? '');
        switch (topic) {
            case MQTT_TOPICS.MACHINE_HEARTBEAT:
                void MQTTTopicHandler.handleHeartbeat(payload).catch(e =>
                    log.error('heartbeat handler error', { message: e instanceof Error ? e.message : String(e) }));
                eventBus.publish({ type: 'machine.status.changed', source: 'MQTTService', machineId, payload });
                break;
            case MQTT_TOPICS.MACHINE_STATUS:
                void MQTTTopicHandler.handleStatus(payload).catch(e =>
                    log.error('status handler error', { message: e instanceof Error ? e.message : String(e) }));
                eventBus.publish({ type: 'machine.status.changed', source: 'MQTTService', machineId, payload });
                break;
            case MQTT_TOPICS.MACHINE_CYCLE:
                void MQTTTopicHandler.handleCycle(payload).catch(e =>
                    log.error('cycle handler error', { message: e instanceof Error ? e.message : String(e) }));
                break;
            case MQTT_TOPICS.MACHINE_ALARM:
                void MQTTTopicHandler.handleAlarm(payload).catch(e =>
                    log.error('alarm handler error', { message: e instanceof Error ? e.message : String(e) }));
                eventBus.publish({ type: 'machine.alarm', source: 'MQTTService', machineId, payload });
                break;
            case MQTT_TOPICS.MACHINE_DOWNTIME:
                void MQTTTopicHandler.handleDowntime(payload).catch(e =>
                    log.error('downtime handler error', { message: e instanceof Error ? e.message : String(e) }));
                break;
            case MQTT_TOPICS.PRODUCTION_UPDATE:
                eventBus.publish({ type: 'order.created', source: 'MQTTService', workOrderId: String(payload.workOrderId ?? ''), payload });
                break;
            case MQTT_TOPICS.INSPECTION_UPDATE:
                eventBus.publish({ type: 'quality.approved', source: 'MQTTService', payload });
                break;
        }
    }

    // ── Test/demo helpers ──────────────────────────────────────────────────────

    /** Inject a message as if it arrived from the broker. Used in tests and demo simulation. */
    simulateInbound(topic: string, payload: MQTTPayload): void {
        const rawBuffer = Buffer.from(JSON.stringify(payload));
        this._handleRawMessage(topic, rawBuffer);
    }

    /** Force-set connection state (test helper). */
    _testSetState(state: MQTTConnectionState): void {
        this._setState(state);
    }
}

export const MQTTService = MQTTServiceClass.getInstance();
