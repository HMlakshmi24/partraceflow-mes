import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/services/database';
import { withRetry } from '@/lib/db-retry';
import { createLogger } from '@/lib/logger';

const ALLOWED = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'];

export async function GET(req: NextRequest) {
  const denied = requireRole(req, ALLOWED);
  if (denied) return denied;

  const log = createLogger('api/reports/qc', req.headers.get('x-correlation-id') ?? undefined);

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const dateTo   = to   ? new Date(to)   : new Date();

  try {
    const [checks, inspections, reworkTasks] = await Promise.all([
      withRetry(() =>
        prisma.qualityCheck.findMany({
          where: { task: { startTime: { gte: dateFrom, lte: dateTo } } },
          select: { result: true, parameter: true },
        }),
      ),
      withRetry(() =>
        prisma.inspectionRecord.findMany({
          where: { createdAt: { gte: dateFrom, lte: dateTo } },
          select: { result: true, defectType: true, workOrderId: true },
        }),
      ),
      withRetry(() =>
        prisma.workflowTask.findMany({
          where: { reworkCount: { gt: 0 }, startTime: { gte: dateFrom, lte: dateTo } },
          select: { reworkCount: true, instance: { select: { workOrder: { select: { orderNumber: true } } } } },
          orderBy: { reworkCount: 'desc' },
          take: 10,
        }),
      ),
    ]);

    const passCount  = checks.filter(c => c.result === 'PASS').length;
    const failCount  = checks.filter(c => c.result === 'FAIL').length;
    const reworkCount = checks.filter(c => c.result === 'REWORK').length;
    const totalChecks = checks.length;

    const defectCounts: Record<string, number> = {};
    for (const ins of inspections) {
      if (ins.defectType) defectCounts[ins.defectType] = (defectCounts[ins.defectType] ?? 0) + 1;
    }
    const topDefects = Object.entries(defectCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    const inspectionPassRate = inspections.length
      ? +(inspections.filter(i => i.result === 'PASS').length / inspections.length * 100).toFixed(1)
      : null;

    const topReworkOrders = reworkTasks.map(t => ({
      orderNumber: t.instance.workOrder.orderNumber,
      reworkCount: t.reworkCount,
    }));

    log.info('qc report generated', { totalChecks, passCount, failCount });

    return NextResponse.json({
      summary: {
        totalChecks,
        passCount,
        failCount,
        reworkCount,
        passRate: totalChecks > 0 ? +(passCount / totalChecks * 100).toFixed(1) : null,
        failRate: totalChecks > 0 ? +(failCount / totalChecks * 100).toFixed(1) : null,
        inspectionPassRate,
      },
      topDefects,
      topReworkOrders,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    });
  } catch (e: any) {
    log.error('qc report failed', { message: e.message });
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }
}
