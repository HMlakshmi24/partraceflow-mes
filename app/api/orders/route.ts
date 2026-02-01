import { NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export async function GET() {
    return NextResponse.json([]); // TODO: Get orders from prisma
}
