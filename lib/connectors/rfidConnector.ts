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
 * Demo RFID Connector - simulates tag scans for testing
 */
export class DemoRFIDConnector extends RFIDConnector {
    private scanning: boolean = false;
    private scanInterval: NodeJS.Timeout | null = null;
    
    // Demo tags that can be scanned
    private demoTags: RFIDTag[] = [
        { epc: 'DEMO-SPOOL-001', tid: 'TID-001', scannedAt: new Date() },
        { epc: 'DEMO-SPOOL-002', tid: 'TID-002', scannedAt: new Date() },
        { epc: 'DEMO-SPOOL-003', tid: 'TID-003', scannedAt: new Date() },
        { epc: 'DEMO-JOINT-001', tid: 'TID-J001', scannedAt: new Date() },
        { epc: 'DEMO-JOINT-002', tid: 'TID-J002', scannedAt: new Date() },
    ];

    constructor() {
        super({ type: RFIDReaderType.NETWORK });
    }

    async connect(): Promise<boolean> {
        this.connected = true;
        return true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        await this.stopScanning();
    }

    async read(): Promise<RFIDReadResult> {
        if (!this.connected) {
            return { success: false, error: 'Not connected' };
        }

        // Randomly return one or more demo tags
        const numTags = Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 1;
        const shuffled = [...this.demoTags].sort(() => Math.random() - 0.5);
        const tags = shuffled.slice(0, numTags).map(t => ({
            ...t,
            rssi: -50 + Math.random() * 20,
            scannedAt: new Date()
        }));

        this.lastScan = tags;
        return { success: true, tags };
    }

    async startScanning(): Promise<void> {
        if (!this.connected || this.scanning) return;
        
        this.scanning = true;
        this.scanInterval = setInterval(async () => {
            if (this.scanning) {
                const result = await this.read();
                if (result.success && result.tags && result.tags.length > 0) {
                    this.notifyScan(result.tags);
                }
            }
        }, 2000); // Scan every 2 seconds
    }

    async stopScanning(): Promise<void> {
        this.scanning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }

    async write(_epc: string): Promise<RFIDWriteResult> {
        if (!this.connected) {
            return { success: false, error: 'Not connected' };
        }

        return { success: true };
    }

    /**
     * Add a custom demo tag for testing
     */
    addDemoTag(epc: string, tid?: string): void {
        this.demoTags.push({
            epc,
            tid: tid || `TID-${Date.now()}`,
            scannedAt: new Date()
        });
    }

    /**
     * Simulate a specific tag scan
     */
    simulateScan(epc: string): void {
        const tag: RFIDTag = {
            epc,
            tid: `TID-${Date.now()}`,
            rssi: -45,
            scannedAt: new Date()
        };
        this.notifyScan([tag]);
    }
}

/**
 * Factory function to create RFID connector
 */
export function createRFIDConnector(config: RFIDReaderConfig, demoMode: boolean = true): RFIDConnector {
    if (demoMode || config.type === RFIDReaderType.NETWORK && config.host === 'demo') {
        return new DemoRFIDConnector();
    }

    // Real connector selection based on type
    switch (config.type) {
        case RFIDReaderType.SERIAL:
            return new SerialRFIDConnector(config);
        case RFIDReaderType.USB:
            return new USBRFIDConnector(config);
        case RFIDReaderType.NETWORK:
            return new NetworkRFIDConnector(config);
        default:
            return new DemoRFIDConnector();
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

export function resolveTag(epc: string): { type: string; id: string } | null {
    // Resolve EPC to spool/joint
    // Demo resolution
    if (epc.startsWith('DEMO-SPOOL')) {
        return { type: 'spool', id: epc.replace('DEMO-', '') };
    }
    if (epc.startsWith('DEMO-JOINT')) {
        return { type: 'joint', id: epc.replace('DEMO-', '') };
    }
    return null;
}

export default {
    RFIDConnector,
    DemoRFIDConnector,
    createRFIDConnector,
    RFIDReaderType
};
