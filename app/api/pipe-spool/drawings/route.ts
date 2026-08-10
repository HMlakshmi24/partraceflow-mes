import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { requireRole } from '@/lib/api-auth';
import { requireSpoolAction } from '@/lib/spoolRBAC';

const SPOOL_ROLES = ['ADMIN', 'SUPERVISOR', 'QUALITY', 'OPERATOR'];

export async function GET(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const lineId = searchParams.get('lineId');
    const status = searchParams.get('status');

    if (id) {
      const drawing = await prisma.isometricDrawing.findFirst({
        where: { id },
        include: { line: true, spools: { select: { id: true, spoolId: true, status: true } } },
      });
      if (!drawing) return apiError('Not found', 'DRAWING_NOT_FOUND', 404);
      return apiSuccess({ drawing });
    }

    const where: any = {};
    if (lineId) where.lineId = lineId;
    if (status) where.status = status;
    

    const drawings = await prisma.isometricDrawing.findMany({
      where,
      orderBy: [{ drawingNumber: 'asc' }],
      include: {
        line: { select: { lineNumber: true } },
        spools: { select: { id: true, spoolId: true } },
      },
    });
    return apiSuccess({ drawings });
  } catch (e) {
    return apiError('Failed to fetch drawings', 'DRAWING_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, SPOOL_ROLES);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    // CRIT-3 fix: these branches had zero fine-grained RBAC beyond the coarse
    // SPOOL_ROLES check, letting any OPERATOR delete/alter any controlled drawing.
    if (action === 'delete' && id) {
      const guard = await requireSpoolAction('DELETE_DOCUMENT');
      if (guard instanceof NextResponse) return guard;
      await prisma.isometricDrawing.delete({ where: { id } });
      return apiSuccess({ deleted: true });
    }

    if (id) {
      const guard = await requireSpoolAction('UPLOAD_DOCUMENT');
      if (guard instanceof NextResponse) return guard;
      const drawing = await prisma.isometricDrawing.update({ where: { id }, data });
      return apiSuccess({ drawing });
    }

    const guard = await requireSpoolAction('UPLOAD_DOCUMENT');
    if (guard instanceof NextResponse) return guard;
    const drawing = await prisma.isometricDrawing.create({ data });
    return apiSuccess({ drawing });
  } catch (e: any) {
    if (e?.code === 'P2002') return apiError('Drawing number already exists', 'DUPLICATE', 409);
    return apiError('Failed to save drawing', 'DRAWING_SAVE_FAILED', 500);
  }
}
