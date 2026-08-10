import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { requireRole } from '@/lib/api-auth';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const line = await prisma.pipeSpoolLine.findFirst({
        where: { id },
        include: {
          spools: { select: { id: true, spoolId: true, status: true } },
          drawings: { where: {}, select: { id: true, drawingNumber: true, revision: true, status: true } },
        },
      });
      if (!line) return apiError('Not found', 'LINE_NOT_FOUND', 404);
      return apiSuccess({ line });
    }

    const lines = await prisma.pipeSpoolLine.findMany({
      where: {},
      orderBy: { lineNumber: 'asc' },
      include: {
        _count: { select: { spools: true, drawings: true } },
      },
    });
    return apiSuccess({ lines });
  } catch (e) {
    return apiError('Failed to fetch lines', 'LINE_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  const guard = await requireSpoolAction('BULK_IMPORT');
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'delete' && id) {
      await prisma.pipeSpoolLine.delete({ where: { id } });
      return apiSuccess({ deleted: true });
    }

    if (id) {
      const line = await prisma.pipeSpoolLine.update({ where: { id }, data });
      return apiSuccess({ line });
    }

    const line = await prisma.pipeSpoolLine.create({ data });
    return apiSuccess({ line });
  } catch (e: any) {
    if (e?.code === 'P2002') return apiError('Line number already exists', 'DUPLICATE', 409);
    return apiError('Failed to save line', 'LINE_SAVE_FAILED', 500);
  }
}
