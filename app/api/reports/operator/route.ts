import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { prisma } from '@/lib/services/database';
import { withRetry } from '@/lib/db-retry';
import { createLogger } from '@/lib/logger';

const ALLOWED = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'];

export async function GET(req: NextRequest) {
  const denied = requireRole(req, ALLOWED);
  if (denied) return denied;

  const log = createLogger('api/reports/operator', req.headers.get('x-correlation-id') ?? undefined);

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const dateTo   = to   ? new Date(to)   : new Date();

  try {
    const tasks = await withRetry(() =>
      prisma.workflowTask.findMany({
        where: {
          operatorId: { not: null },
          status: 'COMPLETED',
          startTime: { gte: dateFrom, lte: dateTo },
          endTime: { not: null },
        },
        select: {
          operatorId: true,
          startTime: true,
          endTime: true,
          operator: { select: { username: true, role: true } },
        },
      }),
    );

    const byOperator: Record<string, {
      operatorId: string;
      username: string;
      role: string;
      tasksCompleted: number;
      totalDurationMs: number;
      lastActive: Date | null;
    }> = {};

    for (const task of tasks) {
      if (!task.operatorId || !task.startTime || !task.endTime) continue;
      const id = task.operatorId;
      if (!byOperator[id]) {
        byOperator[id] = {
          operatorId: id,
          username: task.operator?.username ?? 'unknown',
          role: task.operator?.role ?? 'OPERATOR',
          tasksCompleted: 0,
          totalDurationMs: 0,
          lastActive: null,
        };
      }
      byOperator[id].tasksCompleted++;
      byOperator[id].totalDurationMs += task.endTime.getTime() - task.startTime.getTime();
      if (!byOperator[id].lastActive || task.endTime > byOperator[id].lastActive!) {
        byOperator[id].lastActive = task.endTime;
      }
    }

    const operators = Object.values(byOperator)
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
      .map(op => ({
        operatorId: op.operatorId,
        username: op.username,
        role: op.role,
        tasksCompleted: op.tasksCompleted,
        avgTaskDurationMinutes: op.tasksCompleted > 0
          ? +(op.totalDurationMs / op.tasksCompleted / 60_000).toFixed(1)
          : 0,
        lastActive: op.lastActive?.toISOString() ?? null,
      }));

    log.info('operator report generated', { operatorCount: operators.length });

    return NextResponse.json({
      operators,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    });
  } catch (e: any) {
    log.error('operator report failed', { message: e.message });
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }
}
