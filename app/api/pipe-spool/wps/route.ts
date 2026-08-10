import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { requireRole } from '@/lib/api-auth';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const pqrId = searchParams.get('pqrId');
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    if (id) {
      const wps = await prisma.wPS.findUnique({
        where: { id },
        include: { pqr: true, weldRecords: { take: 10, orderBy: { createdAt: 'desc' } } },
      });
      if (!wps) return NextResponse.json({ error: 'WPS not found' }, { status: 404 });
      return NextResponse.json({ wps });
    }

    const where: any = {};
    if (pqrId) where.pqrId = pqrId;
    if (activeOnly) where.isActive = true;

    const wpsRecords = await prisma.wPS.findMany({
      where,
      orderBy: { wpsNumber: 'asc' },
      include: { pqr: { select: { pqrNumber: true } } },
    });
    return NextResponse.json({ wpsRecords });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch WPS records' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const guard = await requireSpoolAction('UPDATE_SPOOL_STATUS');
    if (guard instanceof NextResponse) return guard;

    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'deactivate' && id) {
      const wps = await prisma.wPS.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ wps });
    }

    if (id) {
      const wps = await prisma.wPS.update({ where: { id }, data });
      return NextResponse.json({ wps });
    }

    if (!data.wpsNumber) {
      return NextResponse.json({ error: 'wpsNumber is required' }, { status: 400 });
    }

    if (data.pqrId) {
      const pqr = await prisma.pQR.findUnique({ where: { id: data.pqrId } });
      if (!pqr) return NextResponse.json({ error: 'PQR not found', code: 'FK_INVALID' }, { status: 422 });
    }

    const wps = await prisma.wPS.create({ data });
    return NextResponse.json({ wps }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'WPS number already exists' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to save WPS' }, { status: 500 });
  }
}
