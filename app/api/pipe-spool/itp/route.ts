import { NextRequest } from 'next/server';
import { prisma } from '@/lib/services/database';
import { apiError, apiSuccess } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    if (id) {
      const template = await prisma.iTPTemplate.findFirst({
        where: { id },
        include: {
          steps: { orderBy: { sequence: 'asc' } },
          _count: { select: { inspections: true } },
        },
      });
      if (!template) return apiError('Not found', 'ITP_NOT_FOUND', 404);
      return apiSuccess({ template });
    }

    const where: any = {};
    if (type) where.type = type;
    if (activeOnly) where.isActive = true;

    const templates = await prisma.iTPTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        steps: { orderBy: { sequence: 'asc' } },
        _count: { select: { inspections: true } },
      },
    });
    return apiSuccess({ templates });
  } catch (e) {
    return apiError('Failed to fetch ITP templates', 'ITP_FETCH_FAILED', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, steps, ...data } = body;

    if (action === 'toggle_active' && id) {
      const template = await prisma.iTPTemplate.findFirst({ where: { id } });
      if (!template) return apiError('Not found', 'ITP_NOT_FOUND', 404);
      const updated = await prisma.iTPTemplate.update({
        where: { id },
        data: { isActive: !template.isActive },
      });
      return apiSuccess({ template: updated });
    }

    if (action === 'add_step' && id) {
      const step = await prisma.iTPStep.create({ data: { ...data, templateId: id } });
      return apiSuccess({ step });
    }

    if (action === 'delete_step') {
      const stepId = data.stepId;
      await prisma.iTPStep.delete({ where: { id: stepId } });
      return apiSuccess({ deleted: true });
    }

    if (action === 'delete' && id) {
      await prisma.iTPTemplate.update({
        where: { id },
        data: { isActive: false },
      });
      return apiSuccess({ deleted: true });
    }

    if (id) {
      const template = await prisma.iTPTemplate.update({ where: { id }, data });
      return apiSuccess({ template });
    }

    const template = await prisma.iTPTemplate.create({
      data: {
        ...data,
        steps: steps
          ? { create: steps.map((s: any, i: number) => ({ ...s, sequence: s.sequence ?? i + 1 })) }
          : undefined,
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    return apiSuccess({ template });
  } catch (e: any) {
    if (e?.code === 'P2002') return apiError('ITP name already exists', 'DUPLICATE', 409);
    return apiError('Failed to save ITP template', 'ITP_SAVE_FAILED', 500);
  }
}
