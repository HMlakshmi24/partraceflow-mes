import { NextResponse } from 'next/server';

export async function GET() {
    // Mock aggregation
    return NextResponse.json({
        department: 'Assembly',
        oee: 0.85,
        availability: 0.92,
        performance: 0.88,
        quality: 0.99
    });
}
