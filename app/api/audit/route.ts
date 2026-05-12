import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
    const authError = requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const view = searchParams.get('view'); // 'diffs' for field-level diff table
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1);
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50') || 50));

        if (view === 'diffs') {
            const entityType = searchParams.get('entityType');
            const entityId = searchParams.get('entityId');
            const eventType = searchParams.get('eventType');

            const where: Record<string, unknown> = {};
            if (entityType) where.entityType = entityType;
            if (entityId) where.entityId = entityId;
            if (eventType) where.eventType = eventType;

            const [total, diffs] = await Promise.all([
                prisma.auditDiff.count({ where }),
                prisma.auditDiff.findMany({
                    where,
                    orderBy: { timestamp: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
            ]);

            return NextResponse.json({ diffs, total, page, pages: Math.ceil(total / limit) });
        }

        const type = searchParams.get('type');
        const userId = searchParams.get('userId');
        const search = searchParams.get('search');

        const where: Record<string, unknown> = {};
        if (type) where.eventType = type;
        if (userId) where.userId = userId;
        if (search) where.details = { contains: search };

        const [total, events] = await Promise.all([
            prisma.systemEvent.count({ where }),
            prisma.systemEvent.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        const typesRaw = await prisma.systemEvent.groupBy({
            by: ['eventType'],
            _count: { eventType: true },
            orderBy: { _count: { eventType: 'desc' } },
        });

        return NextResponse.json({
            events,
            total,
            page,
            pages: Math.ceil(total / limit),
            types: typesRaw.map(t => ({ type: t.eventType, count: t._count.eventType })),
        });
    } catch (error) {
        console.error('[GET /api/audit]', error);
        return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 });
    }
}
