import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
        const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));
        const type = searchParams.get('type');
        const userId = searchParams.get('userId');
        const search = searchParams.get('search');

        const where: any = {};
        if (type) where.eventType = type;
        if (userId) where.userId = userId;
        if (search) where.details = { contains: search };

        const [total, events] = await Promise.all([
            prisma.systemEvent.count({ where }),
            prisma.systemEvent.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            })
        ]);

        // Get distinct event types for filter
        const typesRaw = await prisma.systemEvent.groupBy({
            by: ['eventType'],
            _count: { eventType: true },
            orderBy: { _count: { eventType: 'desc' } }
        });

        return NextResponse.json({
            events,
            total,
            page,
            pages: Math.ceil(total / limit),
            types: typesRaw.map(t => ({ type: t.eventType, count: t._count.eventType }))
        });
    } catch (error) {
        console.error('[GET /api/audit]', error);
        return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 });
    }
}
