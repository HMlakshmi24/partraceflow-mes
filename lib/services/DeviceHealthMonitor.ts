import { prisma } from '@/lib/services/database';
import { AlarmEngine } from '@/lib/services/AlarmEngine';

export const DEFAULT_DEVICE_THRESHOLD_SECONDS = 120; // 2 minutes

export interface DeviceHeartbeatResult {
    deviceId: string;
    wasOffline: boolean;
    status: 'ONLINE';
}

export interface DeviceCheckResult {
    checkedAt: Date;
    offlineCount: number;
    offlineDeviceIds: string[];
}

const DEVICE_OFFLINE_ALARM_CODE = 'DEVICE_OFFLINE';

export class DeviceHealthMonitor {
    /**
     * Receive a heartbeat for an edge device.
     * - Updates lastSeen and sets status ONLINE.
     * - Clears DEVICE_OFFLINE alarms for every machine on this device when recovering from OFFLINE.
     */
    static async heartbeat(deviceId: string): Promise<DeviceHeartbeatResult> {
        const device = await prisma.edgeDevice.findUnique({
            where: { id: deviceId },
            select: { id: true, status: true, tagMaps: { select: { machineId: true } } },
        });
        if (!device) throw new Error(`EdgeDevice not found: ${deviceId}`);

        const wasOffline = device.status !== 'ONLINE';

        await prisma.edgeDevice.update({
            where: { id: deviceId },
            data: { status: 'ONLINE', lastSeen: new Date() },
        });

        // Clear offline alarms for all machines linked through this device on recovery
        if (wasOffline) {
            const machineIds = [...new Set(device.tagMaps.map(t => t.machineId))];
            for (const machineId of machineIds) {
                await AlarmEngine.close(machineId, DEVICE_OFFLINE_ALARM_CODE);
            }
        }

        return { deviceId, wasOffline, status: 'ONLINE' };
    }

    /**
     * Check all devices for stale lastSeen.
     * Marks stale ONLINE devices as OFFLINE and opens a warning alarm on their machines.
     */
    static async checkAll(
        thresholdSeconds = DEFAULT_DEVICE_THRESHOLD_SECONDS,
    ): Promise<DeviceCheckResult> {
        const checkedAt = new Date();
        const cutoff = new Date(Date.now() - thresholdSeconds * 1000);

        const stale = await prisma.edgeDevice.findMany({
            where: {
                status: 'ONLINE',
                OR: [
                    { lastSeen: null },
                    { lastSeen: { lt: cutoff } },
                ],
            },
            include: { tagMaps: { select: { machineId: true } } },
        });

        const offlineDeviceIds: string[] = [];

        for (const device of stale) {
            await prisma.edgeDevice.update({
                where: { id: device.id },
                data: { status: 'OFFLINE' },
            });
            offlineDeviceIds.push(device.id);

            // Open a MEDIUM warning alarm for each machine wired through this device
            const machineIds = [...new Set(device.tagMaps.map(t => t.machineId))];
            for (const machineId of machineIds) {
                await AlarmEngine.open(machineId, {
                    alarmCode: DEVICE_OFFLINE_ALARM_CODE,
                    severity: 'MEDIUM',
                    message: `Edge device ${device.name} (${device.deviceType}) went offline`,
                });
            }
        }

        return { checkedAt, offlineCount: offlineDeviceIds.length, offlineDeviceIds };
    }

    /** Count devices by status. */
    static async statusCounts(): Promise<{ online: number; offline: number; error: number }> {
        const [online, offline, error] = await Promise.all([
            prisma.edgeDevice.count({ where: { status: 'ONLINE' } }),
            prisma.edgeDevice.count({ where: { status: 'OFFLINE' } }),
            prisma.edgeDevice.count({ where: { status: 'ERROR' } }),
        ]);
        return { online, offline, error };
    }

    /** List devices whose lastSeen is stale (without marking them offline). */
    static async listStale(
        thresholdSeconds = DEFAULT_DEVICE_THRESHOLD_SECONDS,
    ): Promise<{ deviceId: string; name: string; lastSeen: Date | null; staleSec: number }[]> {
        const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
        const devices = await prisma.edgeDevice.findMany({
            where: {
                OR: [
                    { lastSeen: null },
                    { lastSeen: { lt: cutoff }, status: 'ONLINE' },
                ],
            },
            select: { id: true, name: true, lastSeen: true },
        });
        const now = Date.now();
        return devices.map(d => ({
            deviceId: d.id,
            name: d.name,
            lastSeen: d.lastSeen,
            staleSec: d.lastSeen ? Math.round((now - d.lastSeen.getTime()) / 1000) : -1,
        }));
    }
}
