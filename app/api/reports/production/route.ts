import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { fetchProductionReport } from '@/lib/services/ReportService';
import { createLogger } from '@/lib/logger';

const ALLOWED = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY'];

export async function GET(req: NextRequest) {
  const denied = await requireRole(req, ALLOWED);
  if (denied) return denied;

  const log = createLogger('api/reports/production', req.headers.get('x-correlation-id') ?? undefined);

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const dateTo   = to   ? new Date(to)   : new Date();

  try {
    const { summary, daily } = await fetchProductionReport({ from: dateFrom, to: dateTo });

    log.info('production report generated', { days: daily.length, totalCompleted: summary.totalCompleted });

    return NextResponse.json({
      summary,
      daily,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('production report failed', { message });
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }
}
