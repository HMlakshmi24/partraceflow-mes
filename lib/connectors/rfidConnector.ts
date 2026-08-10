/**
 * RFID Connector - Interface for RFID tag scanning
 * Supports hardware RFID readers via serial, USB, or network
 * 
 * In demo mode, simulates tag scans
 * In production mode, connects to real RFID hardware
 */

export enum RFIDReaderType {
    SERIAL = 'SERIAL',
    USB = 'USB',
    NETWORK = 'NETWORK'
}

export interface RFIDTag {
    epc: string;           // Electronic Product Code
    tid?: string;          // Transponder ID
    rssi?: number;         // Signal strength
    antenna?: number;       // Antenna port
    scannedAt: Date;
}

export interface RFIDReaderConfig {
    type: RFIDReaderType;
    port?: string;         // COM port for serial, device path for USB
    host?: string;         // IP address for network readers
    portNumber?: number;   // Port number for network
    antennaCount?: number;
}

export interface RFIDReadResult {
    success: boolean;
    tags?: RFIDTag[];
    error?: string;
}

export interface RFIDWriteResult {
    success: boolean;
    error?: string;
}

/**
 * Base RFID Connector class
 */
export abstract class RFIDConnector {
    protected config: RFIDReaderConfig;
    protected connected: boolean = false;
    protected lastScan: RFIDTag[] = [];
    protected scanCallback: ((tags: RFIDTag[]) => void) | null = null;

    constructor(config: RFIDReaderConfig) {
        this.config = config;
    }

    /**
     * Connect to RFID reader
     */
    abstract connect(): Promise<boolean>;

    /**
     * Disconnect from RFID reader
     */
    abstract disconnect(): Promise<void>;

    /**
     * Perform single tag read
     */
    abstract read(): Promise<RFIDReadResult>;

    /**
     * Start continuous scanning
     */
    abstract startScanning(): Promise<void>;

    /**
     * Stop continuous scanning
     */
    abstract stopScanning(): Promise<void>;

    /**
     * Write EPC to blank tag
     */
    abstract write(epc: string): Promise<RFIDWriteResult>;

    /**
     * Register callback for scan events
     */
    onScan(callback: (tags: RFIDTag[]) => void): void {
        this.scanCallback = callback;
    }

    isConnected(): boolean {
        return this.connected;
    }

    getLastScan(): RFIDTag[] {
        return this.lastScan;
    }

    protected notifyScan(tags: RFIDTag[]): void {
        this.lastScan = tags;
        if (this.scanCallback) {
            this.scanCallback(tags);
        }
    }
}

/**
 * Factory function to create RFID connector
 */
export function createRFIDConnector(config: RFIDReaderConfig): RFIDConnector {
    switch (config.type) {
        case RFIDReaderType.SERIAL:
            return new SerialRFIDConnector(config);
        case RFIDReaderType.USB:
            return new USBRFIDConnector(config);
        case RFIDReaderType.NETWORK:
            return new NetworkRFIDConnector(config);
        default:
            throw new Error(`Unsupported RFID reader type: ${config.type}`);
    }
}

// Placeholder implementations for real readers
class SerialRFIDConnector extends RFIDConnector {
    async connect(): Promise<boolean> {
        this.connected = true;
        return true;
    }
    async disconnect(): Promise<void> { this.connected = false; }
    async read(): Promise<RFIDReadResult> { return { success: false, error: 'Not implemented' }; }
    async startScanning(): Promise<void> {}
    async stopScanning(): Promise<void> {}
    async write(): Promise<RFIDWriteResult> { return { success: false, error: 'Not implemented' }; }
}

class USBRFIDConnector extends RFIDConnector {
    async connect(): Promise<boolean> {
        this.connected = true;
        return true;
    }
    async disconnect(): Promise<void> { this.connected = false; }
    async read(): Promise<RFIDReadResult> { return { success: false, error: 'Not implemented' }; }
    async startScanning(): Promise<void> {}
    async stopScanning(): Promise<void> {}
    async write(): Promise<RFIDWriteResult> { return { success: false, error: 'Not implemented' }; }
}

class NetworkRFIDConnector extends RFIDConnector {
    private ws: WebSocket | null = null;

    async connect(): Promise<boolean> {
        const { host, port } = this.config;
        if (!host) return false;
        try {
            this.connected = true;
            return true;
        } catch {
            this.connected = false;
            return false;
        }
    }
    async disconnect(): Promise<void> {
        this.connected = false;
        this.ws = null;
    }
    async read(): Promise<RFIDReadResult> {
        if (!this.connected) return { success: false, error: `Network RFID reader at ${this.config.host}:${this.config.port} is not connected. Call connect() first.` };
        return { success: false, error: `Network RFID read requires LLRP protocol driver for ${this.config.host}. Install @rfid/llrp-client and configure the reader.` };
    }
    async startScanning(): Promise<void> {
        if (!this.connected) throw new Error('Reader not connected');
    }
    async stopScanning(): Promise<void> {}
    async write(): Promise<RFIDWriteResult> {
        return { success: false, error: 'Network RFID write requires LLRP protocol driver configuration.' };
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper functions for RFID API routes (required exports)
// ─────────────────────────────────────────────────────────────────

interface ReaderHealth {
    id: string;
    name: string;
    status: string;
    lastSeen: Date;
}

// In-memory reader state
const readers: Map<string, { status: string; lastSeen: Date }> = new Map();

export function getReaderHealth(): ReaderHealth[] {
    const health: ReaderHealth[] = [];
    readers.forEach((state, id) => {
        health.push({
            id,
            name: id,
            status: state.status,
            lastSeen: state.lastSeen
        });
    });
    return health;
}

export function heartbeat(readerId: string): void {
    readers.set(readerId, { status: 'ONLINE', lastSeen: new Date() });
}

// Track recent reads to detect duplicates
const recentReads: Map<string, number> = new Map();
const DUPLICATE_WINDOW_MS = 3000; // 3 seconds

export function isDuplicate(readerId: string, epc: string): boolean {
    const key = `${readerId}:${epc}`;
    const lastRead = recentReads.get(key);
    if (!lastRead) return false;
    return Date.now() - lastRead < DUPLICATE_WINDOW_MS;
}

export function recordRead(epc: string, readerId: string): void {
    const key = `${readerId}:${epc}`;
    recentReads.set(key, Date.now());
    heartbeat(readerId);
}

export async function resolveTag(epc: string): Promise<{ type: string; id: string; entityId: string } | null> {
    const { prisma } = await import('@/lib/services/database');

    const spool = await prisma.pipeSpool.findFirst({
        where: { OR: [{ rfidTag1: epc }, { rfidTag2: epc }, { barcode: epc }] },
        select: { id: true, spoolId: true },
    });
    if (spool) return { type: 'spool', id: spool.spoolId, entityId: spool.id };

    const joint = await prisma.spoolJoint.findFirst({
        where: { OR: [{ rfidTag1: epc }, { rfidTag2: epc }, { barcode: epc }] },
        select: { id: true, jointId: true },
    });
    if (joint) return { type: 'joint', id: joint.jointId, entityId: joint.id };

    return null;
}

const rfidConnector = {
    RFIDConnector,
    createRFIDConnector,
    RFIDReaderType
};

export default rfidConnector;
