import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE, createSessionToken, COOKIE_OPTIONS } from '@/lib/auth';
import { SessionRoleSchema } from '@/lib/validation';

/**
 * GET /api/session - Returns current user from the session token.
 * Falls back to mes_role cookie for backwards compatibility.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      return NextResponse.json({
        role: session.role,
        userId: session.userId,
        username: session.username,
        authenticated: true,
      });
    }
  }

  const role = request.cookies.get('mes_role')?.value ?? null;
  return NextResponse.json({ role, authenticated: false });
}

/**
 * POST /api/session - Demo-only role switching.
 * Disabled by default and restricted to authenticated admins.
 */
export async function POST(request: NextRequest) {
  try {
    if (process.env.MES_ENABLE_DEMO_ROLE_SWITCH !== '1') {
      return NextResponse.json({ success: false, error: 'Role switching is disabled' }, { status: 403 });
    }

    const existingToken = request.cookies.get(SESSION_COOKIE)?.value;
    const session = existingToken ? verifySessionToken(existingToken) : null;
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required for demo role switching' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = SessionRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }

    const { role } = parsed.data;
    const res = NextResponse.json({ success: true, role });

    res.cookies.set('mes_role', role, { path: '/', httpOnly: false, sameSite: 'lax' });
    const newToken = createSessionToken({ userId: session.userId, username: session.username, role });
    res.cookies.set(SESSION_COOKIE, newToken, COOKIE_OPTIONS);

    return res;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
