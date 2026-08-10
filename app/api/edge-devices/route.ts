import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const CreateEdgeDeviceSchema = z.object({
    name:            z.string().min(1).max(100),
    deviceType:      z.enum(['PLC', 'OPCUA_GATEWAY', 'MQTT_GATEWAY', 'SENSOR_NODE']),
    ipAddress:       z.string().min(1),
    port:            z.number().int().min(1).max(65535),
    protocol:        z.enum(['OPCUA', 'MQTT', 'MODBUS', 'REST']),
    plantId:         z.string().optional(),
    productionLineId: z.string().optional(),
});

// GET /api/edge-devices
export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'MAINTENANCE']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status') ?? undefined;

        const devices = await prisma.edgeDevice.findMany({
            where: { ...(status ? { status } : {}) },
            include: {
                plant:          { select: { id: true, code: true, name: true } },
                productionLine: { select: { id: true, code: true, name: true } },
                _count:         { select: { tagMaps: true } },
            },
            orderBy: { name: 'asc' },
        });

        const [online, offline, error] = await Promise.all([
            prisma.edgeDevice.count({ where: { status: 'ONLINE' } }),
            prisma.edgeDevice.count({ where: { status: 'OFFLINE' } }),
            prisma.edgeDevice.count({ where: { status: 'ERROR' } }),
        ]);

        return NextResponse.json({ devices, counts: { online, offline, error } });
    } catch (err) {
                return handleApiError('[GET /api/edge-devices]', err);
    }
}

// POST /api/edge-devices
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const body = await req.json();
        const parsed = CreateEdgeDeviceSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const device = await prisma.edgeDevice.create({ data: parsed.data });
        return NextResponse.json(device, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/edge-devices]', err);
    }
}
