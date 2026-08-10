import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/spoolRBAC';
import { requireSignature } from '@/lib/services/ElectronicSignatureService';
import { apiError, apiSuccess } from '@/lib/apiResponse';
import { requireRole } from '@/lib/api-auth';
import { getClientIp } from '@/lib/utils/getClientIp';

const ALL_ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QUALITY', 'QC', 'MAINTENANCE'];

/**
 * POST /api/auth/verify-signature
 *
 * Body: { password, entityType, entityId, reason, payload? }
 *
 * `payload` should be the exact decision content the caller is about to
 * submit to the follow-up approval call (e.g. { result: 'PASS', notes,
 * clientApproved } for an inspection). When supplied, it's hashed and bound
 * to the returned signature — the approval route re-hashes the content it's
 * actually about to commit and rejects the signature if the two don't
 * match (see ElectronicSignatureService.verifySignatureForEntity).
 *
 * Returns: { signatureId } on success
 * Used by approval routes that require password re-entry (21 CFR Part 11 style).
 */
export async function POST(req: NextRequest) {
  const authError = await requireRole(req, ALL_ROLES);
  if (authError) return authError;

  const session = await getSessionUser();
  if (!session) return apiError('Unauthenticated', 'UNAUTHENTICATED', 401);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('Invalid JSON', 'BAD_REQUEST', 400);

  const { password, entityType, entityId, reason, payload } = body;
  if (!password || !entityType || !entityId || !reason) {
    return apiError('password, entityType, entityId, reason are required', 'BAD_REQUEST', 400);
  }

  const ip = getClientIp(req);

  const result = await requireSignature({
    userId: session.userId,
    password,
    entityType,
    entityId,
    reason,
    ipAddress: ip,
    payload,
  });

  if (!result.ok) {
    const status = result.code === 'INVALID_CREDENTIALS' ? 401
      : result.code === 'USER_INACTIVE' ? 403
      : 500;
    return apiError(result.error, result.code, status);
  }

  return apiSuccess({ signatureId: result.signatureId });
}
