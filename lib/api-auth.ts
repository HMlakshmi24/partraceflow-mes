import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { isSessionValid } from '@/lib/auth';

export interface RequestSession {
  userId: string;
  username: string;
  role: string;
  sessionVersion?: number;
}

export function getRequestSession(req: NextRequest): RequestSession | null {
  const userId   = req.headers.get('x-mes-user-id');
  const username = req.headers.get('x-mes-username');
  const role     = req.headers.get('x-mes-role');
  const sessionVersionRaw = req.headers.get('x-mes-session-version');
  if (userId && username && role) {
    return {
      userId,
      username,
      role,
      sessionVersion: sessionVersionRaw !== null ? Number(sessionVersionRaw) : undefined,
    };
  }
  return null;
}

// ─── DB liveness check (CRIT-4 fix) ────────────────────────────────────────
//
// middleware.ts only verifies the token's signature/expiry — it never touches
// the DB, so a deactivated account or a revoked session (bumped
// User.sessionVersion) previously kept working against every route using
// requireRole() until the token itself expired (up to 8h in operator-terminal
// mode). This cache-backed check re-validates isActive/sessionVersion against
// the DB, bounding staleness to LIVENESS_CACHE_TTL_MS instead of the full
// token lifetime, without adding a DB round-trip to every single request.
const LIVENESS_CACHE_TTL_MS = 15_000;
const livenessCache = new Map<string, { isActive: boolean; sessionVersion: number; expiresAt: number }>();

async function checkSessionLive(userId: string): Promise<{ isActive: boolean; sessionVersion: number } | null> {
  const cached = livenessCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, sessionVersion: true },
  }).catch(() => null);

  if (!dbUser) {
    livenessCache.delete(userId);
    return null;
  }

  const entry = { isActive: dbUser.isActive, sessionVersion: dbUser.sessionVersion, expiresAt: Date.now() + LIVENESS_CACHE_TTL_MS };
  livenessCache.set(userId, entry);
  return entry;
}

/** Call after an admin action that changes a user's isActive/sessionVersion
 * (deactivation, role change, forced logout) so the change is enforced on
 * that user's very next request instead of waiting out the cache TTL. */
export function invalidateSessionLivenessCache(userId: string): void {
  livenessCache.delete(userId);
}

export async function requireRole(req: NextRequest, allowed: string[]): Promise<NextResponse | null> {
  const session = getRequestSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!allowed.includes(session.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions', required: allowed, current: session.role },
      { status: 403 }
    );
  }

  const live = await checkSessionLive(session.userId);
  if (!live || !isSessionValid(session.sessionVersion, live.sessionVersion, live.isActive)) {
    return NextResponse.json({ error: 'Session no longer valid — please log in again' }, { status: 401 });
  }

  return null;
}
