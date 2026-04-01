/**
 * PLC Connector Stub
 *
 * This file contains a lightweight interface for interacting with PLCs.
 * It intentionally does NOT include low-level protocols (e.g., Modbus, OPC-UA)
 * — instead, the real implementation should wrap a tested library or a
 * gateway microservice that handles industrial protocols and security.
 */

export async function readTag(deviceId: string, tag: string) {
    console.info('plcConnector.readTag: stub', { deviceId, tag });
    return { value: Math.random() > 0.5 ? 'ON' : 'OFF' };
}

export async function writeTag(deviceId: string, tag: string, value: any) {
    console.info('plcConnector.writeTag: stub', { deviceId, tag, value });
    return { success: true };
}

export default { readTag, writeTag };
