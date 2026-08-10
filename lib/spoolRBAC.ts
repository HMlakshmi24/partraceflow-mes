/**
 * Spool System - Action-Level RBAC
 *
 * Defines exactly which roles can perform which actions.
 * Import requireSpoolAction in API routes to enforce.
 */

import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE, isSessionValid } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/apiResponse';
import { prisma } from '@/lib/services/database';

// ── Approval RBAC additions ───────────────────────────────────────────────────

// Permission matrix

export const SPOOL_PERMISSIONS = {
  // Spools
  CREATE_SPOOL:          ['OPERATOR', 'QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  ASSIGN_YARD:           ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],

  // Inspections
  CREATE_INSPECTION:     ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  APPROVE_INSPECTION:    ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],

  // NDE
  CREATE_NDE:            ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  APPROVE_NDE:           ['QUALITY', 'SUPERVISOR', 'ADMIN'],
  REJECT_NDE:            ['QUALITY', 'SUPERVISOR', 'ADMIN'],

  // Welds
  CREATE_WELD:           ['OPERATOR', 'SUPERVISOR', 'ADMIN'],
  UPDATE_WELD:           ['OPERATOR', 'SUPERVISOR', 'ADMIN'],

  // NCR
  RAISE_NCR:             ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  CLOSE_NCR:             ['QUALITY', 'SUPERVISOR', 'ADMIN'],

  // Pressure Tests
  CREATE_PRESSURE_TEST:  ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  APPROVE_PRESSURE_TEST: ['QUALITY', 'SUPERVISOR', 'ADMIN'],

  // Hold / Release
  PLACE_HOLD:            ['QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  RELEASE_HOLD:          ['QUALITY', 'SUPERVISOR', 'ADMIN'],
  OVERRIDE_HOLD:         ['SUPERVISOR', 'ADMIN'],

  // Approvals (sign-offs)
  APPROVE_SPOOL:         ['QUALITY', 'SUPERVISOR', 'ADMIN'],
  REJECT_SPOOL:          ['QUALITY', 'SUPERVISOR', 'ADMIN'],

  // Documents
  UPLOAD_DOCUMENT:       ['OPERATOR', 'QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  DELETE_DOCUMENT:       ['QUALITY', 'SUPERVISOR', 'ADMIN'],

  // Status changes
  UPDATE_SPOOL_STATUS:   ['OPERATOR', 'QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  UPDATE_JOINT_STATUS:   ['OPERATOR', 'QC', 'QUALITY', 'SUPERVISOR', 'ADMIN'],

  // Revision override
  OVERRIDE_REVISION:     ['SUPERVISOR', 'ADMIN'],

  // Admin
  DELETE_RECORD:         ['ADMIN'],
  BULK_IMPORT:           ['SUPERVISOR', 'ADMIN'],

  // Phase 4 — Production Integrity
  APPROVE_WORK_ORDER:    ['SUPERVISOR', 'ADMIN'],
  APPROVE_MDR:           ['QUALITY', 'SUPERVISOR', 'ADMIN'],
  APPROVE_PWHT:          ['QUALITY', 'SUPERVISOR', 'ADMIN'],
  APPROVE_COMPLETION:    ['SUPERVISOR', 'ADMIN'],
  SOFT_DELETE:           ['SUPERVISOR', 'ADMIN'],
  VERIFY_AUDIT_CHAIN:    ['QUALITY', 'SUPERVISOR', 'ADMIN'],
} as const;

export type SpoolPermission = keyof typeof SPOOL_PERMISSIONS;

// Session helpers

export async function getSessionRole(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const payload = verifySessionToken(token);
    return payload?.role ?? null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<{ userId: string; username: string; role: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const payload = verifySessionToken(token);
    if (!payload) return null;

    // DB liveness check: verify user still active and role/version unchanged
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true, role: true, sessionVersion: true },
    }).catch(() => null);

    if (!dbUser) return null;
    if (!isSessionValid(payload.sessionVersion, dbUser.sessionVersion, dbUser.isActive)) return null;

    // Use DB role (in case admin changed it since token was issued)
    return { userId: payload.userId, username: payload.username, role: dbUser.role };
  } catch {
    return null;
  }
}

// Guard function

/**
 * Call at the start of a route handler.
 * Returns { role, userId, username } if allowed, NextResponse 401/403 if not.
 *
 * Usage:
 *   const guard = await requireSpoolAction('CLOSE_NCR');
 *   if (guard instanceof NextResponse) return guard;
 *   const { role } = guard;
 */
export async function requireSpoolAction(
  permission: SpoolPermission,
): Promise<{ role: string; userId?: string; username?: string } | NextResponse> {
  const session = await getSessionUser();
  const role = session?.role ?? null;

  if (!role) {
    return apiError('Unauthenticated - please log in', 'UNAUTHENTICATED', 401);
  }

  const allowed = SPOOL_PERMISSIONS[permission] as readonly string[];
  if (!allowed.includes(role)) {
    return apiError(
      `Forbidden - role '${role}' cannot perform '${permission}'`,
      'FORBIDDEN',
      403,
      { requiredRoles: allowed },
    );
  }

  return { role, userId: session?.userId, username: session?.username };
}

/**
 * Check without throwing - for UI conditional rendering via API.
 */
export function canPerform(role: string, permission: SpoolPermission): boolean {
  const allowed = SPOOL_PERMISSIONS[permission] as readonly string[];
  return allowed.includes(role);
}
