/**
 * GET /api/rfid/readers  — Reader health dashboard
 * POST /api/rfid/readers — Register/heartbeat a reader
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReaderHealth, heartbeat } from '@/lib/connectors/rfidConnector';

export async function GET() {
  const readers = getReaderHealth();
  const online = readers.filter(r => r.online).length;
  return NextResponse.json({ readers, online, total: readers.length });
}

export async function POST(req: NextRequest) {
  const { readerId, name, location } = await req.json();
  if (!readerId) return NextResponse.json({ error: 'readerId required' }, { status: 400 });
  heartbeat(readerId, name, location);
  return NextResponse.json({ status: 'ok', readerId });
}
