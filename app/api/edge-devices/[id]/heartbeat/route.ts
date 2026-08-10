import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiResponse';
import { requireRole } from '@/lib/api-auth';
import { DeviceHealthMonitor } from '@/lib/services/DeviceHealthMonitor';

// POST /api/edge-devices/[id]/heartbeat â€” receive a heartbeat from an edge device
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireRole(req, ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MAINTENANCE']);
    if (authError) return authError;

    const { id } = await params;
    try {
        const result = await DeviceHealthMonitor.heartbeat(id);
        return NextResponse.json({ success: true, receivedAt: new Date().toISOString(), ...result });
    } catch (err: any) {
        if (err?.message?.includes('not found')) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
                return handleApiError('[POST /api/edge-devices/[id]/heartbeat]', err);
    }
}
