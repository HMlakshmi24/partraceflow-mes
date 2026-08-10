import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { UpdateShiftTemplateSchema } from '@/lib/validation';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const { id } = await params;
        const body = await req.json();
        const parsed = UpdateShiftTemplateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const existing = await prisma.shiftTemplate.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Shift template not found' }, { status: 404 });
        }

        // Duplicate name check (when renaming)
        if (parsed.data.name && parsed.data.name !== existing.name) {
            const nameConflict = await prisma.shiftTemplate.findUnique({ where: { name: parsed.data.name } });
            if (nameConflict) {
                return NextResponse.json({ error: `A template named "${parsed.data.name}" already exists` }, { status: 409 });
            }
        }

        const template = await prisma.shiftTemplate.update({
            where: { id },
            data: parsed.data,
        });
        return NextResponse.json({ template });
    } catch {
        return NextResponse.json({ error: 'Failed to update shift template' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const { id } = await params;
        const existing = await prisma.shiftTemplate.findUnique({
            where: { id },
            select: { id: true, _count: { select: { schedules: true } } },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Shift template not found' }, { status: 404 });
        }
        if (existing._count.schedules > 0) {
            return NextResponse.json(
                { error: 'Cannot delete a template that is linked to existing schedules' },
                { status: 409 },
            );
        }

        await prisma.shiftTemplate.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete shift template' }, { status: 500 });
    }
}
