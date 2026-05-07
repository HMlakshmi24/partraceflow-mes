import { NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export const dynamic = 'force-dynamic';

export async function GET() {
    const start = Date.now();

    let dbStatus: 'ok' | 'error' = 'error';
    let dbLatencyMs = 0;
    let dbError: string | undefined;
    let counts: Record<string, number> = {};

    try {
        const t0 = Date.now();
        await prisma.user.findFirst({ select: { id: true } });
        dbLatencyMs = Date.now() - t0;
        dbStatus = 'ok';

        const [machines, workOrders, users, auditEvents] = await Promise.all([
            prisma.machine.count(),
            prisma.workOrder.count(),
            prisma.user.count(),
            prisma.systemEvent.count(),
        ]);
        counts = { machines, workOrders, users, auditEvents };
    } catch (e) {
        dbError = (e as Error).message;
    }

    const healthy = dbStatus === 'ok';
    const isProd = process.env.NODE_ENV === 'production';

    // Security configuration warnings — critical for production readiness
    const securityWarnings: string[] = [];
    if (!process.env.SESSION_SECRET) securityWarnings.push('SESSION_SECRET not set — using insecure default');
    if (!process.env.MES_API_KEY) securityWarnings.push('MES_API_KEY not set — machine API endpoints are unprotected');
    if (!process.env.DATABASE_URL && !process.env.MONGODB_URI) securityWarnings.push('No database URL configured — running in demo mode');

    return NextResponse.json(
        {
            status: healthy ? 'healthy' : 'degraded',
            version: process.env.npm_package_version ?? '1.0.0',
            environment: process.env.NODE_ENV ?? 'development',
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            responseMs: Date.now() - start,
            checks: {
                database: { status: dbStatus, latencyMs: dbLatencyMs, error: dbError, counts },
                memory: {
                    status: 'ok',
                    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                },
                security: {
                    status: securityWarnings.length === 0 ? 'ok' : isProd ? 'critical' : 'warning',
                    warnings: securityWarnings,
                },
            },
        },
        {
            status: healthy ? 200 : 503,
            headers: { 'Cache-Control': 'no-store', 'X-Health-Status': healthy ? 'healthy' : 'degraded' },
        }
    );
}
