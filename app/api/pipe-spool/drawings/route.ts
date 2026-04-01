import { NextRequest } from 'next/server';
import { prisma } from '@/lib/services/database';
import { apiError, apiSuccess } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
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
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === 'delete' && id) {
      await prisma.isometricDrawing.delete({ where: { id } });
      return apiSuccess({ deleted: true });
    }

    if (id) {
      const drawing = await prisma.isometricDrawing.update({ where: { id }, data });
      return apiSuccess({ drawing });
    }

    const drawing = await prisma.isometricDrawing.create({ data });
    return apiSuccess({ drawing });
  } catch (e: any) {
    if (e?.code === 'P2002') return apiError('Drawing number already exists', 'DUPLICATE', 409);
    return apiError('Failed to save drawing', 'DRAWING_SAVE_FAILED', 500);
  }
}
