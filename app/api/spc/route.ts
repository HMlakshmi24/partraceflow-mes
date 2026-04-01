import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { SPCService } from '@/lib/services/SPCService';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const parameterId = searchParams.get('parameterId');
        const machineId = searchParams.get('machineId');
        const points = parseInt(searchParams.get('points') ?? '100');

        if (parameterId) {
            const data = await SPCService.getChartData(parameterId, points);
            return NextResponse.json({ data });
        }

        const where: any = {};
        if (machineId) where.machineId = machineId;

        const [parameters, machines] = await Promise.all([
            prisma.processParameter.findMany({
                where,
                include: {
                    controlLimits: { orderBy: { calculatedAt: 'desc' }, take: 1 },
                    _count: { select: { spcRecords: true } }
                },
                orderBy: { parameterName: 'asc' }
            }),
            prisma.machine.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
        ]);

        const machineMap = Object.fromEntries(machines.map(m => [m.id, m]));
        const enriched = parameters.map(p => ({
            ...p,
            machine: machineMap[p.machineId] ?? { id: p.machineId, name: p.machineId }
        }));

        return NextResponse.json({ parameters: enriched, machines });
    } catch (error) {
        console.error('[GET /api/spc]', error);
        return NextResponse.json({ error: 'Failed to fetch SPC data' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'add_measurement') {
            const { parameterId, value, machineId, taskId, operatorId } = body;
            if (!parameterId || value === undefined || !machineId) {
                return NextResponse.json({ error: 'parameterId, value, machineId required' }, { status: 400 });
            }
            const record = await SPCService.addMeasurement({ parameterId, value, machineId, taskId, operatorId });
            return NextResponse.json({ success: true, record });
        }

        if (action === 'recalculate') {
            const { parameterId, sampleCount } = body;
            if (!parameterId) return NextResponse.json({ error: 'parameterId required' }, { status: 400 });
            const limits = await SPCService.recalculateControlLimits(parameterId, sampleCount ?? 50);
            return NextResponse.json({ success: true, limits });
        }

        if (action === 'create_parameter') {
            const { parameterName, unit, machineId, nominalValue, upperSpecLimit, lowerSpecLimit } = body;
            if (!parameterName || !machineId) return NextResponse.json({ error: 'parameterName and machineId required' }, { status: 400 });

            const param = await prisma.processParameter.create({
                data: { parameterName, unit, machineId, nominalValue, upperSpecLimit, lowerSpecLimit }
            });
            return NextResponse.json({ success: true, param });
        }

        if (action === 'seed_demo') {
            const machines = await prisma.machine.findMany({ take: 2 });
            if (machines.length === 0) return NextResponse.json({ error: 'No machines found' }, { status: 404 });

            const results: any[] = [];
            const DEMO_PARAMS = [
                { name: 'Spindle Speed',     unit: 'RPM',    nominal: 3000, usl: 3300, lsl: 2700, sigma: 80 },
                { name: 'Feed Rate',         unit: 'mm/min', nominal: 150,  usl: 165,  lsl: 135,  sigma: 5 },
                { name: 'Surface Roughness', unit: 'Ra μm',  nominal: 1.6,  usl: 2.0,  lsl: 1.2,  sigma: 0.1 },
            ];

            for (let pi = 0; pi < DEMO_PARAMS.length; pi++) {
                const dp = DEMO_PARAMS[pi];
                const machine = machines[pi % machines.length];

                let param = await prisma.processParameter.findFirst({
                    where: { parameterName: dp.name, machineId: machine.id }
                });
                if (!param) {
                    param = await prisma.processParameter.create({
                        data: {
                            parameterName: dp.name,
                            unit: dp.unit,
                            machineId: machine.id,
                            nominalValue: dp.nominal,
                            upperSpecLimit: dp.usl,
                            lowerSpecLimit: dp.lsl
                        }
                    });
                }

                // Generate 60 sample points
                const records: any[] = [];
                for (let i = 59; i >= 0; i--) {
                    const t = new Date(Date.now() - i * 72 * 60 * 1000);
                    const drift = i < 10 ? dp.sigma * 1.5 : 0;
                    const value = dp.nominal + drift + (Math.random() - 0.5) * dp.sigma * 2;
                    records.push({
                        parameterId: param.id,
                        value: parseFloat(value.toFixed(3)),
                        machineId: machine.id,
                        measuredAt: t,
                        inControl: true,
                        violationType: null
                    });
                }

                // Insert one by one to avoid skipDuplicates issue
                for (const r of records) {
                    try { await prisma.sPCRecord.create({ data: r }); } catch (_) {}
                }

                await SPCService.recalculateControlLimits(param.id, 50);
                results.push({ parameter: dp.name, records: records.length });
            }

            return NextResponse.json({ success: true, seeded: results });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('[POST /api/spc]', error);
        return NextResponse.json({ error: 'SPC action failed' }, { status: 500 });
    }
}
