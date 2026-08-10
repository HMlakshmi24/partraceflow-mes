import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const CreatePLCTagSchema = z.object({
    edgeDeviceId: z.string().min(1),
    machineId:    z.string().min(1),
    tagName:      z.string().min(1).max(100),
    mqttTopic:    z.string().optional(),
    opcNodeId:    z.string().optional(),
    signalType:   z.enum(['STATUS', 'COUNT', 'REJECT', 'TEMPERATURE', 'ALARM', 'DOWNTIME']),
    dataType:     z.enum(['FLOAT', 'INT', 'BOOL', 'STRING']),
    scaleFactor:  z.number().optional(),
    enabled:      z.boolean().default(true),
}).refine(d => d.mqttTopic || d.opcNodeId, {
    message: 'At least one of mqttTopic or opcNodeId is required',
    path: ['mqttTopic'],
});

// GET /api/plc-tags
export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'MAINTENANCE']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const edgeDeviceId = searchParams.get('edgeDeviceId') ?? undefined;
        const machineId    = searchParams.get('machineId') ?? undefined;

        const tags = await prisma.pLCTagMap.findMany({
            where: {
                ...(edgeDeviceId ? { edgeDeviceId } : {}),
                ...(machineId    ? { machineId }    : {}),
            },
            include: {
                edgeDevice: { select: { id: true, name: true, deviceType: true, status: true } },
                machine:    { select: { id: true, code: true, name: true } },
            },
            orderBy: [{ edgeDeviceId: 'asc' }, { tagName: 'asc' }],
        });

        return NextResponse.json({ tags });
    } catch (err) {
                return handleApiError('[GET /api/plc-tags]', err);
    }
}

// POST /api/plc-tags
export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const body = await req.json();
        const parsed = CreatePLCTagSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const { edgeDeviceId, tagName } = parsed.data;

        // Duplicate check: unique per [edgeDeviceId, tagName]
        const existing = await prisma.pLCTagMap.findFirst({ where: { edgeDeviceId, tagName } });
        if (existing) {
            return NextResponse.json(
                { error: `Tag '${tagName}' already mapped on this device` },
                { status: 409 },
            );
        }

        const tag = await prisma.pLCTagMap.create({ data: parsed.data });
        return NextResponse.json(tag, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/plc-tags]', err);
    }
}
