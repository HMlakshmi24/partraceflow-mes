import { NextResponse } from 'next/server';
import { getManufacturingOrders, getProducts } from '@/lib/actions/erp';

/**
 * Orders API
 *
 * Returns products and manufacturing orders required by the Planner UI.
 * Keep this endpoint minimal — complex business logic belongs in `lib/actions`.
 */
export async function GET() {
    try {
        const [products, orders] = await Promise.all([
            getProducts(),
            getManufacturingOrders(),
        ]);

        return NextResponse.json({ products, orders });
    } catch (error) {
        return NextResponse.json({ products: [], orders: [] }, { status: 200 });
    }
}
