import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { CreateShiftTemplateSchema } from '@/lib/validation';

export async function GET() {
    try {
        const templates = await prisma.shiftTemplate.findMany({
            orderBy: { name: 'asc' },
        });
        return NextResponse.json({ templates });
    } catch {
        return NextResponse.json({ error: 'Failed to fetch shift templates' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const body = await req.json();
        const parsed = CreateShiftTemplateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const { name, startTime, endTime, targetQuantity } = parsed.data;

        // Duplicate name check
        const existing = await prisma.shiftTemplate.findUnique({ where: { name } });
        if (existing) {
            return NextResponse.json({ error: `A template named "${name}" already exists` }, { status: 409 });
        }

        const template = await prisma.shiftTemplate.create({
            data: { name, startTime, endTime, targetQuantity: targetQuantity ?? null },
        });
        return NextResponse.json({ template }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to create shift template' }, { status: 500 });
    }
}
