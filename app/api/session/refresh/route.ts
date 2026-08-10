import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken, createSessionToken, getCookieOptions } from '@/lib/auth';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { requireRole } from '@/lib/api-auth';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

export async function POST(request: NextRequest) {
  const authError = await requireRole(request, ALL_ROLES);
  if (authError) return authError;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ success: false, error: 'No session' }, { status: 401 });

  const session = verifySessionToken(token);
  if (!session) return NextResponse.json({ success: false, error: 'Session expired' }, { status: 401 });

  // mfaVerified is carried forward from the current token, not reset — this
  // extends an already-authenticated session (refresh happens automatically
  // in the background near token expiry); resetting it would yank a user
  // who already passed MFA back to the verify screen mid-workflow, which
  // isn't what "refresh" means. mfaEnabled reflects the account's real
  // current state, same as the token being refreshed.
  const refreshed = createSessionToken({
    userId: session.userId,
    username: session.username,
    role: session.role,
    mustChangePassword: session.mustChangePassword,
    sessionVersion: session.sessionVersion,
    mfaEnabled: session.mfaEnabled,
    mfaVerified: session.mfaVerified,
  });

  const res = NextResponse.json({ success: true, refreshed: true });
  res.cookies.set(SESSION_COOKIE, refreshed, getCookieOptions(session.role));

  await AuditService.log(
    EventType.SESSION_REFRESHED,
    `Session refreshed for ${session.username}`,
    { role: session.role },
    session.userId,
  ).catch(() => {});

  return res;
}

