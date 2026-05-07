import { NextRequest, NextResponse } from 'next/server';

export interface RequestSession {
  userId: string;
  username: string;
  role: string;
}

/** Read the session injected by middleware into request headers. */
export function getRequestSession(req: NextRequest): RequestSession | null {
  const userId = req.headers.get('x-mes-user-id');
  const username = req.headers.get('x-mes-username');
  const role = req.headers.get('x-mes-role');
  if (!userId || !username || !role) return null;
  return { userId, username, role };
}

/**
 * Returns a 401/403 response if the caller's session role is not in `allowed`.
 * Returns null when the check passes (caller is allowed to proceed).
 */
export function requireRole(req: NextRequest, allowed: string[]): NextResponse | null {
  const session = getRequestSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized — session required' }, { status: 401 });
  }
  if (!allowed.includes(session.role)) {
    return NextResponse.json(
      { error: `Role ${session.role} cannot perform this action. Required: ${allowed.join(', ')}.` },
      { status: 403 },
    );
  }
  return null;
}
