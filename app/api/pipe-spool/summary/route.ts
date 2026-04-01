import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { apiError, apiSuccess } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  try {
    const [
      totalLines,
      totalSpools,
      totalJoints,
      openNCRs,
      criticalNCRs,
      spoolsByStatus,
      jointsByStatus,
      ndeHolds,
      pendingApprovals,
      recentInspections,
    ] = await Promise.all([
      prisma.pipeSpoolLine.count(),
      prisma.pipeSpool.count(),
      prisma.spoolJoint.count(),
      prisma.nCRRecord.count({ where: { status: { not: 'CLOSED' } } }),
      prisma.nCRRecord.count({ where: { severity: 'CRITICAL', status: { not: 'CLOSED' } } }),
      prisma.pipeSpool.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.spoolJoint.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.nDERecord.count({ where: { holdFlag: true } }),
      prisma.spoolApproval.count({ where: { status: 'PENDING' } }),
      prisma.spoolInspection.findMany({
        take: 10,
        orderBy: { inspectedAt: 'desc' },
        include: {
          spool: { select: { spoolId: true } },
          joint: { select: { jointId: true } },
          itpStep: { select: { description: true } },
        },
      }),
    ]);

    // Spool completion rate
    const completedSpools = spoolsByStatus.find(s => s.status === 'COMPLETE')?._count._all ?? 0;
    const completionRate = totalSpools > 0 ? Math.round((completedSpools / totalSpools) * 100) : 0;

    // Joint weld completion
    const completedJoints = jointsByStatus.find(j => j.status === 'COMPLETE')?._count._all ?? 0;
    const weldCompletionRate = totalJoints > 0 ? Math.round((completedJoints / totalJoints) * 100) : 0;

    return apiSuccess({
      summary: {
        totalLines,
        totalSpools,
        totalJoints,
        completionRate,
        weldCompletionRate,
        openNCRs,
        criticalNCRs,
        ndeHolds,
        pendingApprovals,
        spoolsByStatus: Object.fromEntries(spoolsByStatus.map(s => [s.status, s._count._all])),
        jointsByStatus: Object.fromEntries(jointsByStatus.map(j => [j.status, j._count._all])),
      },
      recentInspections,
    });
  } catch (e) {
    return apiError('Failed to fetch summary', 'SUMMARY_FETCH_FAILED', 500);
  }
}
