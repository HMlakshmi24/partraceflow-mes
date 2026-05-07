import { NextRequest, NextResponse } from 'next/server';
import { getManufacturingOrders, getProducts } from '@/lib/actions/erp';
import { requireRole } from '@/lib/api-auth';

/**
 * Orders API
 *
 * Returns products and manufacturing orders required by the Planner UI.
 * Keep this endpoint minimal — complex business logic belongs in `lib/actions`.
 */
export async function GET(req: NextRequest) {
    const authError = requireRole(req, ['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR', 'QC', 'QUALITY']);
    if (authError) return authError;

    try {
        const [products, orders] = await Promise.all([
            getProducts(),
            getManufacturingOrders(),
        ]);

        return NextResponse.json({ products, orders });
    } catch (error) {
        console.error('[GET /api/orders]', error);
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}
