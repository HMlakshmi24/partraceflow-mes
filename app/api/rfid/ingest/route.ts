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
import { handleApiError } from '@/lib/apiResponse';
import { isDuplicate, heartbeat, recordRead, resolveTag } from '@/lib/connectors/rfidConnector';
import { RFIDIngestSchema, validationError } from '@/lib/validation';
import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';
import { requireRole, getRequestSession, RequestSession } from '@/lib/api-auth';
import { recordStatusChange } from '@/lib/services/StatusHistoryService';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/getClientIp';

const RFID_ROLES = ['ADMIN', 'SUPERVISOR', 'MAINTENANCE'];

const log = createLogger('rfid.ingest');

export async function POST(req: NextRequest) {
  const authError = await requireRole(req, RFID_ROLES);
  if (authError) return authError;

  // MEDIUM fix: bulk-ingest endpoint had no rate limiting at all. Limit is
  // generous (a busy gateway serving many readers can legitimately send
  // several reads/sec) — this is an abuse/misconfiguration backstop, not a
  // throughput cap for normal operation; per-reader+tag 3s dedup below
  // handles normal duplicate suppression.
  const ip = getClientIp(req);
  const rl = await rateLimit(`rfid-ingest:${ip}`, { limit: 600, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } });
  }

  try {
    const raw = await req.json();
    const parsed = RFIDIngestSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const { tagId, readerId, timestamp, location, rssi } = parsed.data;

    const ts = timestamp ? new Date(timestamp) : new Date();

    // Register reader heartbeat
    heartbeat(readerId);

// Dedup: ignore if same reader+tag within 3 seconds
    if (isDuplicate(readerId, tagId)) {
      return NextResponse.json({ status: 'duplicate', tagId, readerId, message: 'Duplicate read ignored' });
    }

    recordRead(tagId, readerId);

    // Resolve which asset this tag belongs to
    const asset = await resolveTag(tagId);

    log.info('tag read accepted', { tagId, readerId, assetType: asset?.type, ts: ts.toISOString() });

    // Auto-advance spool status based on reader location
    if (asset && asset.type === 'spool' && location) {
      await autoAdvanceFromReader(asset.id, location, getRequestSession(req));
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
        return handleApiError('[rfid/ingest]', e);
  }
}

// Auto-advance spool status when scanned at known reader locations.
//
// CRIT-6 fix: this previously validated against a hardcoded literal
// ('FABRICATING') instead of the spool's real current status, and wrote the
// new status unconditionally (no `where` guard tied to the read status, and
// no audit trail via StatusHistoryService) — a scan at "Yard Entrance" could
// silently regress an already-advanced spool back to RECEIVED. It now reads
// the real status, uses a conditional update scoped to that status (so a
// concurrent change loses the race safely instead of clobbering), and
// records the transition in the audit trail like every other status change.
async function autoAdvanceFromReader(spoolId: string, location: string, session: RequestSession | null) {
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

  const spool = await prisma.pipeSpool.findUnique({ where: { id: spoolId }, select: { status: true } });
  if (!spool) return;
  const currentStatus = spool.status;

  if (!from.includes(currentStatus)) return;

  const spoolMod = await import('@/lib/spoolTransitions');
  if (!spoolMod.canTransition(spoolMod.SPOOL_TRANSITIONS, currentStatus, to)) return;

  try {
    const result = await prisma.pipeSpool.updateMany({
      where: { id: spoolId, status: currentStatus },
      data: { status: to },
    });
    if (result.count === 0) {
      log.warn('spool status auto-advance skipped — status changed concurrently', { spoolId, expected: currentStatus });
      return;
    }
    await recordStatusChange('PipeSpool', spoolId, currentStatus, to, {
      changedBy: session?.username ?? 'rfid-gateway',
      changedByUserId: session?.userId,
      changedByRole: session?.role,
    }, `RFID auto-advance at ${location}`).catch(() => {});
  } catch (e: any) {
    log.warn('spool status auto-advance failed', { message: e?.message });
  }
}
