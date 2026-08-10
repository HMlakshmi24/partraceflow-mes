import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth';
import { requireRole } from '@/lib/api-auth';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

export async function GET(request: NextRequest) {
  const authError = await requireRole(request, ALL_ROLES);
  if (authError) return authError;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    role: session.role,
    userId: session.userId,
    username: session.username,
    exp: session.exp,
    authenticated: true,
    mustChangePassword: session.mustChangePassword ?? false,
    mfaEnabled: session.mfaEnabled ?? false,
    mfaVerified: session.mfaVerified ?? false,
  });
}
