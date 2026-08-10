/**
 * ElectronicSignatureService
 *
 * Required for critical approval actions:
 *   - Inspection approval
 *   - PWHT approval
 *   - MDR approval
 *   - Completion sign-off
 *
 * Flow:
 *   1. Client sends password re-entry with the approval request.
 *   2. Server calls requireSignature() which:
 *        a) Verifies the password against the DB hash.
 *        b) Creates an ElectronicSignature record.
 *        c) Returns the signatureId on success.
 *   3. The approval route stores signatureId alongside the approval record.
 */

import crypto from 'crypto';
import { verifyPassword } from '@/lib/auth';
import { prisma } from './database';
import { createLogger } from '@/lib/logger';

const log = createLogger('ElectronicSignatureService');

// ─── Payload hashing (tamper-evidence) ───────────────────────────────────────
//
// Industry-readiness fix: an ElectronicSignature previously only proved *who*
// signed, *when*, and for *which entityType/entityId* — not *what they
// approved*. A signatureId obtained for one decision (e.g. "record this
// inspection as PASS") could be replayed against a request body that had
// been swapped in transit or re-submitted with different values (e.g.
// FAIL→PASS, or a different nextStatus), as long as the entity/user/time
// window still matched. Binding the signature to a hash of the exact
// decision content closes that gap: the hash is computed once when the
// signature is issued (POST /api/auth/verify-signature) and re-checked
// against the content actually being committed when the signature is spent
// (verifySignatureForEntity) — any mismatch means the record changed after
// the user reviewed and signed it, and the action is rejected.

/** Deterministic JSON stringify: sorts object keys recursively so the same
 * logical payload always hashes identically regardless of property
 * insertion order. Array order is preserved (it's meaningful). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = canonicalize(obj[key]);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return value;
}

/** SHA-256 hex digest of a canonicalized payload. Exported for testing
 * without DB and for callers that need to pre-compute a hash client-side
 * for comparison/debugging. */
export function hashSignaturePayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}

export type SignatureResult =
  | { ok: true; signatureId: string }
  | { ok: false; error: string; code: 'INVALID_CREDENTIALS' | 'USER_INACTIVE' | 'USER_NOT_FOUND' | 'DB_ERROR' };

/**
 * Pure check: validates a signature payload before writing to DB.
 * Exported for testing without DB.
 */
export function validateSignaturePayload(params: {
  userId: string;
  entityType: string;
  entityId: string;
  reason: string;
}): { valid: boolean; error?: string } {
  if (!params.userId?.trim()) return { valid: false, error: 'userId required' };
  if (!params.entityType?.trim()) return { valid: false, error: 'entityType required' };
  if (!params.entityId?.trim()) return { valid: false, error: 'entityId required' };
  if (!params.reason?.trim()) return { valid: false, error: 'reason required' };
  return { valid: true };
}

/**
 * Verify password and create an ElectronicSignature record.
 * Returns signatureId on success.
 */
export async function requireSignature(params: {
  userId: string;
  password: string;
  entityType: string;
  entityId: string;
  reason: string;
  ipAddress?: string;
  /** The exact decision content the signer is attesting to (e.g.
   * { result: 'PASS', notes, clientApproved }). Optional for backward
   * compatibility with any caller that doesn't yet supply one — when
   * omitted, verifySignatureForEntity skips the content check for this
   * signature rather than failing closed on a null hash. */
  payload?: unknown;
}): Promise<SignatureResult> {
  const payloadCheck = validateSignaturePayload(params);
  if (!payloadCheck.valid) {
    return { ok: false, error: payloadCheck.error!, code: 'INVALID_CREDENTIALS' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, passwordHash: true, isActive: true },
    });

    if (!user) return { ok: false, error: 'User not found', code: 'USER_NOT_FOUND' };
    if (!user.isActive) return { ok: false, error: 'User account is disabled', code: 'USER_INACTIVE' };

    if (!user.passwordHash) {
      return { ok: false, error: 'Account has no password configured — signature requires password verification', code: 'INVALID_CREDENTIALS' };
    }
    if (!verifyPassword(params.password, user.passwordHash)) {
      return { ok: false, error: 'Invalid password — signature rejected', code: 'INVALID_CREDENTIALS' };
    }

    const sig = await prisma.electronicSignature.create({
      data: {
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        reason: params.reason,
        ipAddress: params.ipAddress ?? null,
        payloadHash: params.payload !== undefined ? hashSignaturePayload(params.payload) : null,
      },
    });

    return { ok: true, signatureId: sig.id };
  } catch (e) {
    log.error('failed to create signature', { message: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: 'Signature service error', code: 'DB_ERROR' };
  }
}

const SIGNATURE_MAX_AGE_MS = 5 * 60_000; // a signature is only valid to spend within 5 minutes of being created

export type SignatureCheckResult = { ok: true } | { ok: false; error: string };

/**
 * HIGH-8 fix: verifies that `signatureId` is a real ElectronicSignature
 * record — created by the *same user* performing this action, for *this
 * exact entity*, and recently enough to not be a replay of an old signature
 * — before an approval route commits its state change. Previously nothing
 * checked this: routes accepted an approval with no signatureId at all, so
 * the whole password-re-entry flow was front-end-only UI formality that the
 * API itself never required or verified.
 *
 * Industry-readiness fix: when the signature was issued with a `payload`
 * (see requireSignature), the caller must now also supply the content it's
 * about to commit, hashed and compared against the stored payloadHash. This
 * closes the gap where entityType/entityId/user/time-window all still
 * matched but the actual decision (result, next status, etc.) had been
 * swapped between "user reviewed and signed" and "server applied the
 * change" — e.g. a tampered request body, or someone else changing the
 * record in between. A signature created without a payload skips this
 * check (nothing to compare against).
 */
export async function verifySignatureForEntity(params: {
  signatureId: string | undefined | null;
  userId: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
}): Promise<SignatureCheckResult> {
  if (!params.signatureId) {
    return { ok: false, error: 'Electronic signature required for this action — call /api/auth/verify-signature first and include the returned signatureId.' };
  }

  const sig = await prisma.electronicSignature.findUnique({ where: { id: params.signatureId } });
  if (!sig) return { ok: false, error: 'Signature not found' };
  if (sig.userId !== params.userId) return { ok: false, error: 'Signature does not belong to the requesting user' };
  if (sig.entityType !== params.entityType || sig.entityId !== params.entityId) {
    return { ok: false, error: 'Signature was issued for a different record' };
  }
  if (sig.payloadHash) {
    if (params.payload === undefined || hashSignaturePayload(params.payload) !== sig.payloadHash) {
      return { ok: false, error: 'Record content no longer matches what was signed — please re-authenticate and sign again.' };
    }
  }
  if (Date.now() - sig.timestamp.getTime() > SIGNATURE_MAX_AGE_MS) {
    return { ok: false, error: 'Signature has expired — please re-authenticate and retry' };
  }

  return { ok: true };
}
