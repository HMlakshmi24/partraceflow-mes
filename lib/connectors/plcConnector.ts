/**
 * PLC Connector - Generic interface for connecting to industrial PLCs
 * Supports OPC-UA, Modbus TCP, and MQTT protocols
 * 
 * In demo mode, values are simulated
 * In production mode, connects to real PLC equipment
 */

export enum PLCProtocol {
    OPC_UA = 'OPC_UA',
    MODBUS_TCP = 'MODBUS_TCP',
    MQTT = 'MQTT'
}

export enum SignalType {
    DIGITAL = 'DIGITAL',
    ANALOG = 'ANALOG',
    STRING = 'STRING'
}

export interface PLCConnectionConfig {
    protocol: PLCProtocol;
    host: string;
    port: number;
    nodeId?: string;        // For OPC-UA
    address?: number;      // For Modbus
    topic?: string;        // For MQTT
    unit?: string;        // Unit of measurement (RPM, °C, etc.)
    interval?: number;     // Polling interval in ms
}

export interface PLCValue {
    value: string | number | boolean;
    quality: 'GOOD' | 'BAD' | 'UNCERTAIN';
    timestamp: Date;
    sourceTimestamp?: Date;
}

export interface PLCReadResult {
    success: boolean;
    value?: PLCValue;
    error?: string;
}

export interface PLCWriteResult {
    success: boolean;
    error?: string;
}

/**
 * Base PLC Connector class
 * Extend this for specific protocols
 */
export abstract class PLCConnector {
    protected config: PLCConnectionConfig;
    protected connected: boolean = false;
    protected lastValue: PLCValue | null = null;
    protected pollInterval: NodeJS.Timeout | null = null;

    constructor(config: PLCConnectionConfig) {
        this.config = config;
    }

    /**
     * Connect to PLC
     */
    abstract connect(): Promise<boolean>;

    /**
     * Disconnect from PLC
     */
    abstract disconnect(): Promise<void>;

    /**
     * Read a single value
     */
    abstract read(): Promise<PLCReadResult>;

    /**
     * Write a value
     */
    abstract write(value: string | number | boolean): Promise<PLCWriteResult>;

    /**
     * Start continuous polling
     */
    startPolling(callback: (value: PLCValue) => void, interval?: number): void {
        const pollMs = interval ?? this.config.interval ?? 1000;
        this.pollInterval = setInterval(async () => {
            const result = await this.read();
            if (result.success && result.value) {
                callback(result.value);
            }
        }, pollMs);
    }

    /**
     * Stop polling
     */
    stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    isConnected(): boolean {
        return this.connected;
    }

    getLastValue(): PLCValue | null {
        return this.lastValue;
    }
}

/**
 * Demo PLC Connector - simulates PLC values for testing
 */
export class DemoPLCConnector extends PLCConnector {
    private demoValue: number = 0;
    private running: boolean = false;

    constructor() {
        super({
            protocol: PLCProtocol.OPC_UA,
            host: 'localhost',
            port: 4840,
            unit: 'units'
        });
    }

    async connect(): Promise<boolean> {
        this.connected = true;
        return true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.stopPolling();
    }

    async read(): Promise<PLCReadResult> {
        if (!this.connected) {
            return { success: false, error: 'Not connected' };
        }

        // Simulate varying values
        if (this.running) {
            this.demoValue += (Math.random() - 0.5) * 10;
        }

        const value: PLCValue = {
            value: Math.round(this.demoValue * 100) / 100,
            quality: 'GOOD',
            timestamp: new Date()
        };

        this.lastValue = value;
        return { success: true, value };
    }

    async write(value: string | number | boolean): Promise<PLCWriteResult> {
        if (!this.connected) {
            return { success: false, error: 'Not connected' };
        }

        this.demoValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        this.running = typeof value === 'boolean' ? value : this.demoValue > 0;
        
        return { success: true };
    }

    /**
     * Simulate machine running state
     */
    setRunningState(running: boolean): void {
        this.running = running;
    }
}

/**
 * Factory function to create PLC connector
 */
export function createPLCConnector(config: PLCConnectionConfig, demoMode: boolean = true): PLCConnector {
    if (demoMode || config.host === 'demo') {
        return new DemoPLCConnector();
    }

    // Real connector selection based on protocol
    switch (config.protocol) {
        case PLCProtocol.OPC_UA:
            return new OPCUAConnector(config);
        case PLCProtocol.MODBUS_TCP:
            return new ModbusTCPConnector(config);
        case PLCProtocol.MQTT:
            return new MQTTConnector(config);
        default:
            return new DemoPLCConnector();
    }
}

// Placeholder for real protocol implementations
class OPCUAConnector extends PLCConnector {
    async connect(): Promise<boolean> {
        this.connected = true;
        return true;
    }
    async disconnect(): Promise<void> { this.connected = false; }
    async read(): Promise<PLCReadResult> { return { success: false, error: 'Not implemented' }; }
    async write(): Promise<PLCWriteResult> { return { success: false, error: 'Not implemented' }; }
}

class ModbusTCPConnector extends PLCConnector {
    async connect(): Promise<boolean> {
        this.connected = true;
        return true;
    }
    async disconnect(): Promise<void> { this.connected = false; }
    async read(): Promise<PLCReadResult> { return { success: false, error: 'Not implemented' }; }
    async write(): Promise<PLCWriteResult> { return { success: false, error: 'Not implemented' }; }
}

class MQTTConnector extends PLCConnector {
    async connect(): Promise<boolean> {
        this.connected = true;
        return true;
    }
    async disconnect(): Promise<void> { this.connected = false; }
    async read(): Promise<PLCReadResult> { return { success: false, error: 'Not implemented' }; }
    async write(): Promise<PLCWriteResult> { return { success: false, error: 'Not implemented' }; }
}

export default {
    PLCConnector,
    DemoPLCConnector,
    createPLCConnector,
    PLCProtocol,
    SignalType
};
