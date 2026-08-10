import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const UpdateEdgeDeviceSchema = z.object({
    name:            z.string().min(1).max(100).optional(),
    deviceType:      z.enum(['PLC', 'OPCUA_GATEWAY', 'MQTT_GATEWAY', 'SENSOR_NODE']).optional(),
    ipAddress:       z.string().min(1).optional(),
    port:            z.number().int().min(1).max(65535).optional(),
    protocol:        z.enum(['OPCUA', 'MQTT', 'MODBUS', 'REST']).optional(),
    status:          z.enum(['ONLINE', 'OFFLINE', 'ERROR']).optional(),
    plantId:         z.string().nullable().optional(),
    productionLineId: z.string().nullable().optional(),
});

// GET /api/edge-devices/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'MAINTENANCE']);
    if (authError) return authError;

    const { id } = await params;
    const device = await prisma.edgeDevice.findUnique({
        where: { id },
        include: {
            tagMaps: {
                include: { machine: { select: { id: true, code: true, name: true } } },
                orderBy: { tagName: 'asc' },
            },
            plant:          { select: { id: true, code: true, name: true } },
            productionLine: { select: { id: true, code: true, name: true } },
        },
    });
    if (!device) return NextResponse.json({ error: 'Edge device not found' }, { status: 404 });
    return NextResponse.json(device);
}

// PUT /api/edge-devices/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const body = await req.json();
        const parsed = UpdateEdgeDeviceSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const device = await prisma.edgeDevice.update({ where: { id }, data: parsed.data });
        return NextResponse.json(device);
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'Edge device not found' }, { status: 404 });
                return handleApiError('[PUT /api/edge-devices/[id]]', err);
    }
}

// DELETE /api/edge-devices/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const count = await prisma.pLCTagMap.count({ where: { edgeDeviceId: id } });
        if (count > 0) {
            return NextResponse.json(
                { error: `Cannot delete: device has ${count} active tag mapping(s). Remove them first.` },
                { status: 409 },
            );
        }
        await prisma.edgeDevice.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'Edge device not found' }, { status: 404 });
                return handleApiError('[DELETE /api/edge-devices/[id]]', err);
    }
}
