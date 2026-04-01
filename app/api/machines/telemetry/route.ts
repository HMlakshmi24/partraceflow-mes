import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const machineId = searchParams.get('machineId');

        // Get latest telemetry per signal, grouped by machine
        const where = machineId ? { machineId } : {};

        // Get the latest record per signal using a subquery approach
        const latestTelemetry = await prisma.machineTelemetry.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: machineId ? 20 : 200,
            include: {
                signal: { select: { signalName: true, unit: true } },
            },
        });

        // Deduplicate: keep only the latest reading per (machineId, signalName)
        const seen = new Set<string>();
        const deduplicated = latestTelemetry.filter(t => {
            const key = `${t.machineId}_${t.signal.signalName}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const telemetry = deduplicated.map(t => ({
            machineId: t.machineId,
            signalName: t.signal.signalName,
            value: t.value,
            unit: t.signal.unit,
            quality: t.quality,
            timestamp: t.timestamp,
        }));

        return NextResponse.json({ telemetry });
    } catch (error) {
        console.error('[GET /api/machines/telemetry]', error);
        return NextResponse.json({ error: 'Failed to fetch telemetry' }, { status: 500 });
    }
}
