/**
 * POST /api/rfid/ingest
 *
 * Universal RFID ingestion endpoint. Any gateway (TCP bridge, MQTT forwarder,
 * handheld scanner app) posts here when a tag is read.
 *
 * Body: { tagId, readerId, timestamp?, readerName?, location?, rssi? }
 *
 * Returns the resolved asset (spool / joint / unknown) so the caller can
 * display context immediately (e.g. handheld display).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isDuplicate, heartbeat, recordRead, resolveTag } from '@/lib/connectors/rfidConnector';
import { RFIDIngestSchema, validationError } from '@/lib/validation';
import { prisma } from '@/lib/services/database';

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = RFIDIngestSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const { tagId, readerId, timestamp, readerName, location, rssi } = parsed.data;

    const ts = timestamp ? new Date(timestamp) : new Date();

    // Register reader heartbeat
    heartbeat(readerId, readerName, location);

    // Dedup: ignore if same reader+tag within 3 seconds
    if (isDuplicate(readerId, tagId)) {
      return NextResponse.json({ status: 'duplicate', tagId, readerId, message: 'Duplicate read ignored' });
    }

    recordRead(readerId);

    // Resolve which asset this tag belongs to
    const asset = await resolveTag(tagId);

    // Audit: log to console (extend to DB by adding RFIDRead model to schema if needed)
    console.info('[rfid/ingest]', { tagId, readerId, asset: asset.type, ts: ts.toISOString() });

    // Auto-advance spool status based on reader location
    if (asset.type === 'spool' && location) {
      await autoAdvanceFromReader(asset.id, asset.status, location);
    }

    return NextResponse.json({
      status: 'accepted',
      tagId,
      readerId,
      readAt: ts.toISOString(),
      rssi: rssi ?? null,
      asset,
    });
  } catch (e: any) {
    console.error('[rfid/ingest]', e);
    return NextResponse.json({ error: e.message ?? 'Ingest failed' }, { status: 500 });
  }
}

// Auto-advance spool status when scanned at known reader locations
async function autoAdvanceFromReader(spoolId: string, currentStatus: string, location: string) {
  const LOCATION_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
    'Yard Entrance': { from: ['FABRICATING'], to: 'RECEIVED' },
    'Storage Zone A': { from: ['RECEIVED'], to: 'IN_STORAGE' },
    'Storage Zone B': { from: ['RECEIVED'], to: 'IN_STORAGE' },
    'Material Office': { from: ['IN_STORAGE'], to: 'ISSUED' },
  };

  const rule = Object.entries(LOCATION_TRANSITIONS).find(([loc]) =>
    location.toLowerCase().includes(loc.toLowerCase())
  );
  if (!rule) return;

  const [, { from, to }] = rule;
  if (!from.includes(currentStatus)) return;

  const { canTransition, SPOOL_TRANSITIONS } = await import('@/lib/spoolTransitions');
  if (!canTransition(SPOOL_TRANSITIONS, currentStatus, to)) return;

  await prisma.pipeSpool.update({
    where: { id: spoolId },
    data: { status: to },
  }).catch(() => {});
}
