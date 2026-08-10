/**
 * POST /api/historian/retention
 *
 * Triggers a retention cycle: HOT â†’ WARM â†’ COLD aggregation.
 * Called by an external scheduler (cron job / task runner) â€” not auto-invoked.
 *
 * GET /api/historian/retention
 *
 * Returns retention class counts across all historian records.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';
import { requireRole } from '@/lib/api-auth';
import { RetentionEngine } from '@/lib/services/RetentionEngine';

export async function POST(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN']);
    if (authError) return authError;

    try {
        const result = await RetentionEngine.runRetentionCycle();
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
                return handleApiError('[POST /api/historian/retention]', err);
    }
}

export async function GET(req: NextRequest) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR']);
    if (authError) return authError;

    try {
        const [hot, warm, cold, total] = await Promise.all([
            prisma.historianRecord.count({ where: { retentionClass: 'HOT'  } }),
            prisma.historianRecord.count({ where: { retentionClass: 'WARM' } }),
            prisma.historianRecord.count({ where: { retentionClass: 'COLD' } }),
            prisma.historianRecord.count(),
        ]);
        return NextResponse.json({ hot, warm, cold, total });
    } catch (err) {
                return handleApiError('[GET /api/historian/retention]', err);
    }
}
