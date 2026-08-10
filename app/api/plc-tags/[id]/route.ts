import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const UpdatePLCTagSchema = z.object({
    tagName:     z.string().min(1).max(100).optional(),
    mqttTopic:   z.string().nullable().optional(),
    opcNodeId:   z.string().nullable().optional(),
    signalType:  z.enum(['STATUS', 'COUNT', 'REJECT', 'TEMPERATURE', 'ALARM', 'DOWNTIME']).optional(),
    dataType:    z.enum(['FLOAT', 'INT', 'BOOL', 'STRING']).optional(),
    scaleFactor: z.number().nullable().optional(),
    enabled:     z.boolean().optional(),
});

// GET /api/plc-tags/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'MAINTENANCE']);
    if (authError) return authError;

    const { id } = await params;
    const tag = await prisma.pLCTagMap.findUnique({
        where: { id },
        include: {
            edgeDevice: { select: { id: true, name: true, deviceType: true } },
            machine:    { select: { id: true, code: true, name: true } },
        },
    });
    if (!tag) return NextResponse.json({ error: 'PLC tag map not found' }, { status: 404 });
    return NextResponse.json(tag);
}

// PUT /api/plc-tags/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const body = await req.json();
        const parsed = UpdatePLCTagSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }

        // Prevent rename collision
        if (parsed.data.tagName) {
            const current = await prisma.pLCTagMap.findUnique({ where: { id } });
            if (!current) return NextResponse.json({ error: 'PLC tag map not found' }, { status: 404 });
            const clash = await prisma.pLCTagMap.findFirst({
                where: { edgeDeviceId: current.edgeDeviceId, tagName: parsed.data.tagName, id: { not: id } },
            });
            if (clash) {
                return NextResponse.json(
                    { error: `Tag '${parsed.data.tagName}' already mapped on this device` },
                    { status: 409 },
                );
            }
        }

        const tag = await prisma.pLCTagMap.update({ where: { id }, data: parsed.data });
        return NextResponse.json(tag);
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'PLC tag map not found' }, { status: 404 });
                return handleApiError('[PUT /api/plc-tags/[id]]', err);
    }
}

// DELETE /api/plc-tags/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    const { id } = await params;
    try {
        await prisma.pLCTagMap.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return NextResponse.json({ error: 'PLC tag map not found' }, { status: 404 });
                return handleApiError('[DELETE /api/plc-tags/[id]]', err);
    }
}
