import { NextRequest } from 'next/server';
import { prisma } from '@/lib/services/database';
import { requireSpoolAction } from '@/lib/spoolRBAC';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { NextResponse } from 'next/server';
import { requireRole, invalidateSessionLivenessCache } from '@/lib/api-auth';

/**
 * POST /api/auth/revoke-session
 *
 * Body: { targetUserId }
 *
 * Increments sessionVersion on the target user, immediately invalidating all
 * their existing session tokens. Used when:
 *   - An admin disables a user account
 *   - A role change needs to take effect without waiting for token expiry
 *
 * Requires: ADMIN role
 */
export async function POST(req: NextRequest) {
  const authError = await requireRole(req, ['ADMIN']);
  if (authError) return authError;

  const guard = await requireSpoolAction('DELETE_RECORD'); // ADMIN only
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => null);
  if (!body?.targetUserId) return apiError('targetUserId required', 'BAD_REQUEST', 400);

  const target = await prisma.user.findUnique({
    where: { id: body.targetUserId },
    select: { id: true, username: true },
  });
  if (!target) return apiError('User not found', 'NOT_FOUND', 404);

  await prisma.user.update({
    where: { id: body.targetUserId },
    data: { sessionVersion: { increment: 1 } },
  });
  invalidateSessionLivenessCache(body.targetUserId);

  return apiSuccess({ revoked: true, username: target.username });
}
