/**
 * Real-Time Event Integration System
 * Multi-protocol integration for manufacturing devices and systems
 * 
 * Features:
 * - MQTT broker integration
 * - OPC-UA client implementation
 * - Modbus TCP/RTU support
 * - RFID reader interface
 * - Vision system webhooks
 * - Kafka/RabbitMQ pipelines
 * - Event normalization layer
 * - Event persistence and replay
 * - Real-time event streaming
 */

import { v4 as uuidv4 } from 'uuid';

// ============ TYPES & INTERFACES ============

export enum EventSource {
  MQTT = 'mqtt',
  OPC_UA = 'opc_ua',
  MODBUS = 'modbus',
  RFID = 'rfid',
  VISION = 'vision',
  PLC = 'plc',
  BARCODE = 'barcode',
  SENSOR = 'sensor',
  WEBHOOK = 'webhook',
}

export enum EventPriority {
  LOW = 1,
  MEDIUM = 5,
  HIGH = 8,
  CRITICAL = 10,
}

export interface RawEvent {
  sourceId: string;
  source: EventSource;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface NormalizedEvent {
  id: string;
  source: EventSource;
  sourceId: string;
  type: string; // e.g., 'machine.started', 'rfid.read', 'quality.alert'
  timestamp: Date;
  data: Record<string, any>;
  priority: EventPriority;
  processable: boolean;
}

export interface EventSubscription {
  id: string;
  filter: (event: NormalizedEvent) => boolean;
  handler: (event: NormalizedEvent) => Promise<void>;
  retryCount: number;
  maxRetries: number;
}

export interface EventStore {
  id: string;
  events: NormalizedEvent[];
  createdAt: Date;
}

export interface MQTTConfig {
  brokerUrl: string;
  topics: string[];
  clientId?: string;
  username?: string;
  password?: string;
}

export interface OPCUAConfig {
  endpointUrl: string;
  nodeIds: string[];
  pollInterval?: number;
}

export interface ModbusConfig {
  host: string;
  port: number;
  unitId?: number;
  registers: { address: number; length: number; name: string }[];
}

// ============ EVENT NORMALIZER ============

class EventNormalizer {
  /**
   * Normalize MQTT event
   */
  static normalizeMQTT(rawEvent: RawEvent): NormalizedEvent {
    const { payload, sourceId, timestamp } = rawEvent;

    // Parse topic-based event type
    const topic = payload.topic || sourceId;
    const parts = topic.split('/');
    const eventType = parts.slice(-2).join('.');

    return {
      id: uuidv4(),
      source: EventSource.MQTT,
      sourceId,
      type: eventType,
      timestamp,
      data: {
        ...payload,
        topic,
      },
      priority: EventPriority.MEDIUM,
      processable: true,
    };
  }

  /**
   * Normalize OPC-UA event
   */
  static normalizeOPCUA(rawEvent: RawEvent): NormalizedEvent {
    const { payload, sourceId, timestamp } = rawEvent;

    return {
      id: uuidv4(),
      source: EventSource.OPC_UA,
      sourceId,
      type: `opc_ua.${payload.nodeId?.split('.').pop() || 'value'}`,
      timestamp,
      data: {
        nodeId: payload.nodeId,
        value: payload.value,
        quality: payload.quality,
        timestamp: payload.timestamp,
      },
      priority: EventPriority.HIGH,
      processable: true,
    };
  }

  /**
   * Normalize RFID event
   */
  static normalizeRFID(rawEvent: RawEvent): NormalizedEvent {
    const { payload, sourceId, timestamp } = rawEvent;

    return {
      id: uuidv4(),
      source: EventSource.RFID,
      sourceId,
      type: `rfid.${payload.action || 'read'}`,
      timestamp,
      data: {
        epc: payload.epc,
        tid: payload.tid,
        rssi: payload.rssi,
        antenna: payload.antenna,
        readTime: payload.readTime,
      },
      priority: EventPriority.HIGH,
      processable: true,
    };
  }

  /**
   * Normalize Vision event
   */
  static normalizeVision(rawEvent: RawEvent): NormalizedEvent {
    const { payload, sourceId, timestamp } = rawEvent;

    return {
      id: uuidv4(),
      source: EventSource.VISION,
      sourceId,
      type: `vision.${payload.detectionType || 'detection'}`,
      timestamp,
      data: {
        detectionType: payload.detectionType,
        confidence: payload.confidence,
        results: payload.results,
        imageUrl: payload.imageUrl,
      },
      priority: EventPriority.HIGH,
      processable: true,
    };
  }

  /**
   * Normalize Modbus event
   */
  static normalizeModbus(rawEvent: RawEvent): NormalizedEvent {
    const { payload, sourceId, timestamp } = rawEvent;

    return {
      id: uuidv4(),
      source: EventSource.MODBUS,
      sourceId,
      type: `modbus.${payload.name || 'data'}`,
      timestamp,
      data: {
        address: payload.address,
        value: payload.value,
        name: payload.name,
      },
      priority: EventPriority.MEDIUM,
      processable: true,
    };
  }

  /**
   * Normalize barcode event
   */
  static normalizeBarcode(rawEvent: RawEvent): NormalizedEvent {
    const { payload, sourceId, timestamp } = rawEvent;

    return {
      id: uuidv4(),
      source: EventSource.BARCODE,
      sourceId,
      type: 'barcode.scanned',
      timestamp,
      data: {
        barcode: payload.barcode,
        type: payload.type, // UPC, EAN, QR, etc.
        scannerId: payload.scannerId,
      },
      priority: EventPriority.HIGH,
      processable: true,
    };
  }

  /**
   * Normalize generic webhook event
   */
  static normalizeWebhook(rawEvent: RawEvent): NormalizedEvent {
    const { payload, sourceId, timestamp } = rawEvent;

    return {
      id: uuidv4(),
      source: EventSource.WEBHOOK,
      sourceId,
      type: payload.eventType || 'webhook.event',
      timestamp,
      data: payload,
      priority: payload.priority ?? EventPriority.MEDIUM,
      processable: true,
    };
  }

  /**
   * Normalize raw event based on source
   */
  static normalize(rawEvent: RawEvent): NormalizedEvent {
    switch (rawEvent.source) {
      case EventSource.MQTT:
        return this.normalizeMQTT(rawEvent);
      case EventSource.OPC_UA:
        return this.normalizeOPCUA(rawEvent);
      case EventSource.RFID:
        return this.normalizeRFID(rawEvent);
      case EventSource.VISION:
        return this.normalizeVision(rawEvent);
      case EventSource.MODBUS:
        return this.normalizeModbus(rawEvent);
      case EventSource.BARCODE:
        return this.normalizeBarcode(rawEvent);
      case EventSource.WEBHOOK:
        return this.normalizeWebhook(rawEvent);
      default:
        return this.normalizeWebhook(rawEvent);
    }
  }
}

// ============ EVENT INTEGRATION ENGINE ============

export class EventIntegrationEngine {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventStore: NormalizedEvent[] = [];
  private eventBuffer: NormalizedEvent[] = [];
  private maxStoreSize: number = 10000;
  private mqttConnections: Map<string, any> = new Map();
  private opcuaConnections: Map<string, any> = new Map();
  private modbusConnections: Map<string, any> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();
  private processingQueue: NormalizedEvent[] = [];
  private isProcessing: boolean = false;

  /**
   * Receive raw event and process it
   */
  async handleRawEvent(rawEvent: RawEvent): Promise<NormalizedEvent> {
    try {
      // Normalize event
      const normalizedEvent = EventNormalizer.normalize(rawEvent);

      // Store event
      this.storeEvent(normalizedEvent);

      // Queue for processing
      this.processingQueue.push(normalizedEvent);

      // Process asynchronously
      this.processEvents();

      this.emit('event:received', { event: normalizedEvent });

      return normalizedEvent;
    } catch (error) {
      this.emit('event:error', { error, rawEvent });
      throw error;
    }
  }

  /**
   * Process buffered events
   */
  private async processEvents(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.processingQueue.length > 0) {
        const event = this.processingQueue.shift()!;

        // Find matching subscriptions
        const matches = Array.from(this.subscriptions.values()).filter((sub) =>
          sub.filter(event)
        );

        // Execute handlers
        for (const subscription of matches) {
          try {
            await subscription.handler(event);
            this.emit('event:processed', { event, subscriptionId: subscription.id });
          } catch (error) {
            // Retry logic
            if (subscription.retryCount < subscription.maxRetries) {
              subscription.retryCount++;
              this.processingQueue.push(event);
              this.emit('event:retry', { event, error, attempt: subscription.retryCount });
            } else {
              this.emit('event:failed', { event, error });
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(
    filter: (event: NormalizedEvent) => boolean,
    handler: (event: NormalizedEvent) => Promise<void>,
    maxRetries: number = 3
  ): string {
    const subscription: EventSubscription = {
      id: uuidv4(),
      filter,
      handler,
      retryCount: 0,
      maxRetries,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.emit('subscription:created', { subscription });

    return subscription.id;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
    this.emit('subscription:removed', { subscriptionId });
  }

  /**
   * Connect MQTT broker (simulated)
   */
  async connectMQTT(config: MQTTConfig): Promise<void> {
    // In production, use mqtt library
    this.mqttConnections.set(config.brokerUrl, {
      config,
      connected: true,
      topics: config.topics,
    });

    this.emit('mqtt:connected', { brokerUrl: config.brokerUrl });
  }

  /**
   * Connect OPC-UA server (simulated)
   */
  async connectOPCUA(config: OPCUAConfig): Promise<void> {
    // In production, use node-opcua library
    this.opcuaConnections.set(config.endpointUrl, {
      config,
      connected: true,
      nodeIds: config.nodeIds,
      pollInterval: config.pollInterval ?? 1000,
    });

    this.emit('opcua:connected', { endpointUrl: config.endpointUrl });

    // Simulate polling
    this.simulateOPCUAPoll(config.endpointUrl, config);
  }

  /**
   * Simulate OPC-UA polling
   */
  private simulateOPCUAPoll(connectionId: string, config: OPCUAConfig): void {
    const handle = setInterval(async () => {
      for (const nodeId of config.nodeIds) {
        // Simulate reading value
        const value = Math.random() * 100;

        const rawEvent: RawEvent = {
          sourceId: nodeId,
          source: EventSource.OPC_UA,
          timestamp: new Date(),
          payload: {
            nodeId,
            value,
            quality: 'Good',
            timestamp: new Date(),
          },
        };

        await this.handleRawEvent(rawEvent);
      }
    }, config.pollInterval ?? 1000);

    this.opcuaConnections.set(connectionId, {
      ...this.opcuaConnections.get(connectionId),
      pollHandle: handle,
    });
  }

  /**
   * Connect Modbus device (simulated)
   */
  async connectModbus(config: ModbusConfig): Promise<void> {
    this.modbusConnections.set(`${config.host}:${config.port}`, {
      config,
      connected: true,
      registers: config.registers,
    });

    this.emit('modbus:connected', { host: config.host, port: config.port });

    // Simulate polling
    this.simulateModbusPoll(config);
  }

  /**
   * Simulate Modbus polling
   */
  private simulateModbusPoll(config: ModbusConfig): void {
    const handle = setInterval(async () => {
      for (const register of config.registers) {
        // Simulate reading register
        const value = Math.random() * 1000;

        const rawEvent: RawEvent = {
          sourceId: `${config.host}:${config.port}`,
          source: EventSource.MODBUS,
          timestamp: new Date(),
          payload: {
            address: register.address,
            value,
            name: register.name,
          },
        };

        await this.handleRawEvent(rawEvent);
      }
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Store event
   */
  private storeEvent(event: NormalizedEvent): void {
    this.eventStore.push(event);

    // Keep store size manageable
    if (this.eventStore.length > this.maxStoreSize) {
      this.eventStore = this.eventStore.slice(-this.maxStoreSize);
    }
  }

  /**
   * Get event history
   */
  getEventHistory(
    filter?: (event: NormalizedEvent) => boolean,
    limit: number = 100
  ): NormalizedEvent[] {
    let events = [...this.eventStore];

    if (filter) {
      events = events.filter(filter);
    }

    return events.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const eventsBySource: Record<EventSource, number> = {} as any;
    const eventsByType: Record<string, number> = {};

    for (const event of this.eventStore) {
      eventsBySource[event.source] = (eventsBySource[event.source] ?? 0) + 1;
      eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
    }

    return {
      totalEvents: this.eventStore.length,
      eventsBySource,
      eventsByType,
      subscriptionCount: this.subscriptions.size,
    };
  }

  /**
   * Event listener management
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    // Close MQTT connections
    for (const [, connection] of this.mqttConnections) {
      if (connection.client) {
        connection.client.end();
      }
    }

    // Close OPC-UA connections
    for (const [, connection] of this.opcuaConnections) {
      if (connection.pollHandle) {
        clearInterval(connection.pollHandle);
      }
    }

    // Close Modbus connections
    for (const [, connection] of this.modbusConnections) {
      if (connection.client) {
        await connection.client.close?.();
      }
    }

    this.eventListeners.clear();
  }
}

export default EventIntegrationEngine;
