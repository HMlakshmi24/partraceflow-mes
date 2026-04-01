import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const zone = searchParams.get('zone');
    const occupied = searchParams.get('occupied');
    const address = searchParams.get('address');

    if (id) {
      const location = await prisma.yardLocation.findUnique({
        where: { id },
        include: { spool: { select: { spoolId: true, status: true } } },
      });
      if (!location) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ location });
    }

    if (address) {
      const location = await prisma.yardLocation.findFirst({
        where: { fullAddress: address },
        include: { spool: { select: { spoolId: true, status: true } } },
      });
      return NextResponse.json({ location });
    }

    const where: any = {};
    if (zone) where.zone = zone;
    if (occupied !== null && occupied !== undefined) where.occupied = occupied === 'true';

    const locations = await prisma.yardLocation.findMany({
      where,
      orderBy: [{ zone: 'asc' }, { rack: 'asc' }, { row: 'asc' }, { position: 'asc' }],
      include: { spool: { select: { spoolId: true, status: true } } },
    });

    // Summary stats
    const total = await prisma.yardLocation.count();
    const occupiedCount = await prisma.yardLocation.count({ where: { occupied: true } });

    return NextResponse.json({ locations, summary: { total, occupied: occupiedCount, free: total - occupiedCount } });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch yard locations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'assign' && id) {
      // Assign a spool to this location
      const location = await prisma.yardLocation.update({
        where: { id },
        data: { spoolId: data.spoolId, occupied: true },
      });
      return NextResponse.json({ location });
    }

    if (action === 'release' && id) {
      // Remove spool from location
      const location = await prisma.yardLocation.update({
        where: { id },
        data: { spoolId: null, occupied: false },
      });
      return NextResponse.json({ location });
    }

    if (action === 'bulk_create') {
      // Create a grid of locations: zone, rack, rows[], positions[]
      const { zone, rack, rows, positions } = data;
      const created: any[] = [];
      for (const row of rows) {
        for (const position of positions) {
          const fullAddress = `${zone}-${rack}-${row}-${position}`;
          const loc = await prisma.yardLocation.upsert({
            where: { fullAddress },
            create: { zone, rack, row, position, fullAddress },
            update: {},
          });
          created.push(loc);
        }
      }
      return NextResponse.json({ created: created.length });
    }

    if (id) {
      const location = await prisma.yardLocation.update({ where: { id }, data });
      return NextResponse.json({ location });
    }

    const fullAddress = `${data.zone}-${data.rack}-${data.row}-${data.position}`;
    const location = await prisma.yardLocation.create({ data: { ...data, fullAddress } });
    return NextResponse.json({ location });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Location address already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save yard location' }, { status: 500 });
  }
}
