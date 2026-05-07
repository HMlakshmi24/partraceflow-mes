import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/services/database';
import { withRetry } from '@/lib/db-retry';
import { createLogger } from '@/lib/logger';

const ALLOWED = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'];

export async function GET(req: NextRequest) {
  const denied = requireRole(req, ALLOWED);
  if (denied) return denied;

  const log = createLogger('api/reports/production', req.headers.get('x-correlation-id') ?? undefined);

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const dateTo   = to   ? new Date(to)   : new Date();

  try {
    const orders = await withRetry(() =>
      prisma.workOrder.findMany({
        where: { createdAt: { gte: dateFrom, lte: dateTo } },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          quantity: true,
          dueDate: true,
          createdAt: true,
          scheduledStart: true,
          scheduledEnd: true,
          workflowInstances: {
            select: {
              tasks: {
                select: {
                  startTime: true,
                  endTime: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
    );

    const byDay: Record<string, { date: string; completed: number; quantity: number; onTime: number; total: number; cycleTimeSum: number; cycleCount: number }> = {};

    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, completed: 0, quantity: 0, onTime: 0, total: 0, cycleTimeSum: 0, cycleCount: 0 };

      byDay[day].total++;
      if (order.status === 'COMPLETED') {
        byDay[day].completed++;
        byDay[day].quantity += order.quantity;

        const allTasks = order.workflowInstances.flatMap(i => i.tasks);
        const first = allTasks.map(t => t.startTime).filter(Boolean).sort()[0];
        const last  = allTasks.map(t => t.endTime).filter(Boolean).sort().at(-1);
        if (first && last) {
          const cycleHours = (last.getTime() - first.getTime()) / 3_600_000;
          byDay[day].cycleTimeSum += cycleHours;
          byDay[day].cycleCount++;
        }

        if (order.dueDate && last && last <= order.dueDate) byDay[day].onTime++;
      }
    }

    const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      date: d.date,
      completed: d.completed,
      quantity: d.quantity,
      total: d.total,
      onTimeRate: d.completed > 0 ? +(d.onTime / d.completed * 100).toFixed(1) : null,
      avgCycleTimeHours: d.cycleCount > 0 ? +(d.cycleTimeSum / d.cycleCount).toFixed(2) : null,
    }));

    const totalCompleted = daily.reduce((s, d) => s + d.completed, 0);
    const totalQuantity  = daily.reduce((s, d) => s + d.quantity, 0);
    const onTimeRates    = daily.filter(d => d.onTimeRate !== null).map(d => d.onTimeRate as number);
    const avgOnTime      = onTimeRates.length ? +(onTimeRates.reduce((s, r) => s + r, 0) / onTimeRates.length).toFixed(1) : null;
    const cycleTimes     = daily.filter(d => d.avgCycleTimeHours !== null).map(d => d.avgCycleTimeHours as number);
    const avgCycle       = cycleTimes.length ? +(cycleTimes.reduce((s, r) => s + r, 0) / cycleTimes.length).toFixed(2) : null;

    log.info('production report generated', { days: daily.length, totalCompleted });

    return NextResponse.json({
      summary: { totalCompleted, totalQuantity, avgOnTimeRate: avgOnTime, avgCycleTimeHours: avgCycle },
      daily,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    });
  } catch (e: any) {
    log.error('production report failed', { message: e.message });
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }
}
