import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

const CreateCapabilitySchema = z.object({
    machineId:          z.string().min(1),
    capabilityType:     z.string().min(1).max(50),
    productCode:        z.string().nullable().optional(),
    maxCapacityPerHour: z.number().positive(),
    idealCycleTime:     z.number().positive(),
    enabled:            z.boolean().default(true),
});

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'PLANNER', 'MAINTENANCE']);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get('machineId') ?? undefined;

    try {
        const capabilities = await prisma.machineCapability.findMany({
            where: { ...(machineId ? { machineId } : {}), enabled: true },
            include: { machine: { select: { id: true, code: true, name: true } } },
            orderBy: [{ machineId: 'asc' }, { capabilityType: 'asc' }],
        });
        return NextResponse.json({ capabilities });
    } catch (err) {
                return handleApiError('[GET /api/machine-capabilities]', err);
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const body   = await req.json();
        const parsed = CreateCapabilitySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
        }
        const { machineId, capabilityType, productCode } = parsed.data;

        // Duplicate check
        const existing = await prisma.machineCapability.findFirst({
            where: { machineId, capabilityType, productCode: productCode ?? null },
        });
        if (existing) {
            return NextResponse.json(
                { error: `Capability '${capabilityType}' already defined for this machine${productCode ? ` and product ${productCode}` : ''}` },
                { status: 409 },
            );
        }

        const cap = await prisma.machineCapability.create({
            data: { ...parsed.data, productCode: productCode ?? null },
        });
        return NextResponse.json(cap, { status: 201 });
    } catch (err) {
                return handleApiError('[POST /api/machine-capabilities]', err);
    }
}
