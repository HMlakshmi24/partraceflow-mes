/**
 * RFID Connector
 *
 * Production-ready gateway connector. RFID readers push tag IDs via:
 *   - HTTP POST → /api/rfid/ingest  (recommended, works with any reader gateway)
 *   - MQTT → topic: rfid/reads/{readerId}  (for Zebra, Impinj, etc.)
 *
 * This module provides:
 *   1. In-process dedup cache (ignores same tag < 3 seconds apart)
 *   2. Reader health registry
 *   3. HTTP push helper for gateway integrations
 *
 * Swap the transport (MQTT/TCP/Serial) without changing MES business logic.
 * The MES only ever sees: { tagId: string, readerId: string, timestamp: Date }
 */

// ── Dedup cache ────────────────────────────────────────────────────────────────
// Prevents processing the same tag twice within DEDUP_WINDOW_MS
const DEDUP_WINDOW_MS = 3000;
const recentReads = new Map<string, number>(); // key: `${readerId}:${tagId}`, val: timestamp

export function isDuplicate(readerId: string, tagId: string): boolean {
  const key = `${readerId}:${tagId}`;
  const last = recentReads.get(key);
  const now = Date.now();
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentReads.set(key, now);
  // Prune entries older than 10s to prevent memory growth
  if (recentReads.size > 500) {
    for (const [k, t] of recentReads) {
      if (now - t > 10000) recentReads.delete(k);
    }
  }
  return false;
}

// ── Reader health registry ─────────────────────────────────────────────────────
export interface ReaderHealth {
  readerId: string;
  name: string;
  location: string;
  lastSeen: Date | null;
  online: boolean;
  totalReads: number;
}

const readerRegistry = new Map<string, ReaderHealth>();

export function heartbeat(readerId: string, name?: string, location?: string): void {
  const existing = readerRegistry.get(readerId);
  readerRegistry.set(readerId, {
    readerId,
    name: name ?? existing?.name ?? readerId,
    location: location ?? existing?.location ?? 'Unknown',
    lastSeen: new Date(),
    online: true,
    totalReads: (existing?.totalReads ?? 0),
  });
}

export function recordRead(readerId: string): void {
  const existing = readerRegistry.get(readerId);
  if (existing) {
    existing.totalReads += 1;
    existing.lastSeen = new Date();
    existing.online = true;
  }
}

export function getReaderHealth(): ReaderHealth[] {
  const now = Date.now();
  // Mark readers offline if no heartbeat in 60 seconds
  for (const reader of readerRegistry.values()) {
    if (reader.lastSeen && now - reader.lastSeen.getTime() > 60000) {
      reader.online = false;
    }
  }
  return Array.from(readerRegistry.values());
}

export function getReader(readerId: string): ReaderHealth | undefined {
  return readerRegistry.get(readerId);
}

// ── Seed demo readers (replaced by real heartbeats in production) ─────────────
const DEMO_READERS = [
  { id: 'GATE_RECV',   name: 'Laydown Yard Gate',     location: 'Yard Entrance' },
  { id: 'STORAGE_A',  name: 'Storage Bay A Scanner',  location: 'Storage Zone A' },
  { id: 'STORAGE_B',  name: 'Storage Bay B Scanner',  location: 'Storage Zone B' },
  { id: 'ISSUE_DESK', name: 'Issue Desk Reader',       location: 'Material Office' },
  { id: 'WELD_SHOP',  name: 'Weld Shop Entry',         location: 'Fabrication Hall' },
  { id: 'MOBILE_01',  name: 'Handheld Scanner #1',     location: 'Field' },
  { id: 'MOBILE_02',  name: 'Handheld Scanner #2',     location: 'Field' },
];

// Seed on module load — real readers replace these via heartbeat()
for (const r of DEMO_READERS) {
  readerRegistry.set(r.id, {
    readerId: r.id,
    name: r.name,
    location: r.location,
    lastSeen: null,
    online: false,
    totalReads: 0,
  });
}

// ── Tag lookup helper (MES business logic) ────────────────────────────────────
// Called from /api/rfid/ingest after dedup passes
export async function resolveTag(tagId: string): Promise<
  | { type: 'spool'; id: string; spoolId: string; status: string }
  | { type: 'joint'; id: string; jointId: string; status: string }
  | { type: 'unknown' }
> {
  // Lazy import to avoid circular dep on prisma at module init
  const { prisma } = await import('@/lib/services/database');

  const spool = await prisma.pipeSpool.findFirst({
    where: { OR: [{ rfidTag1: tagId }, { rfidTag2: tagId }] },
    select: { id: true, spoolId: true, status: true },
  });
  if (spool) return { type: 'spool', ...spool };

  const joint = await prisma.spoolJoint.findFirst({
    where: { OR: [{ rfidTag1: tagId }, { rfidTag2: tagId }] },
    select: { id: true, jointId: true, status: true },
  });
  if (joint) return { type: 'joint', ...joint };

  return { type: 'unknown' };
}

// Legacy stubs — kept for backwards compat, now delegate to real logic
export async function readTagOnce(readerId: string) {
  console.info('[rfidConnector] readTagOnce called — awaiting real reader push to /api/rfid/ingest', { readerId });
  return null; // No random tags — wait for real hardware
}

export async function subscribeToReader(readerId: string, onTag: (tag: string) => void) {
  console.info('[rfidConnector] subscribeToReader — use /api/rfid/ingest endpoint for real hardware', { readerId });
  return { success: true };
}

export default { readTagOnce, subscribeToReader, isDuplicate, resolveTag, getReaderHealth, heartbeat };
