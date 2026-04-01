/**
 * Revision Control Guard
 *
 * Detects when work is being recorded against a spool whose linked
 * isometric drawing is NOT at AFC (Approved For Construction) status,
 * or when the drawing revision has been superseded.
 *
 * Returns a warning or blocks the action depending on severity.
 */

import { prisma } from '@/lib/services/database';

export type RevisionCheckResult =
  | { ok: true }
  | { ok: false; block: boolean; reason: string; drawingNumber: string; revision: string; drawingStatus: string };

/**
 * Check if the spool's drawing is valid for construction work.
 *
 * @param spoolId   PipeSpool.id
 * @param workType  Type of work being recorded (for context in the error message)
 * @param bypass    Role has OVERRIDE_REVISION permission — convert block to warning
 */
export async function checkRevision(
  spoolId: string,
  workType: 'WELD' | 'NDE' | 'INSPECTION' | 'PRESSURE_TEST',
  bypass = false,
): Promise<RevisionCheckResult> {
  const spool = await prisma.pipeSpool.findUnique({
    where: { id: spoolId },
    select: {
      spoolId: true,
      drawing: {
        select: {
          drawingNumber: true,
          revision: true,
          status: true,
        },
      },
    },
  });

  if (!spool?.drawing) {
    // No drawing linked — warn but don't block (drawing may not be required yet)
    return { ok: true };
  }

  const { drawingNumber, revision, status } = spool.drawing;

  // SUPERSEDED = blocked (work on old revision = wrong)
  if (status === 'SUPERSEDED') {
    return {
      ok: false,
      block: !bypass,
      reason: `Drawing ${drawingNumber} Rev ${revision} is SUPERSEDED. ${bypass ? 'Bypassed by supervisor.' : 'Update drawing before recording work.'}`,
      drawingNumber,
      revision,
      drawingStatus: status,
    };
  }

  // IFR (Issued For Review) = allow but warn — not yet approved for construction
  if (status === 'IFR') {
    return {
      ok: false,
      block: false, // warn only
      reason: `Drawing ${drawingNumber} Rev ${revision} is IFR (not yet AFC). Confirm with engineering before recording ${workType}.`,
      drawingNumber,
      revision,
      drawingStatus: status,
    };
  }

  // IFC (Issued For Construction) or AFC (Approved For Construction) = OK
  return { ok: true };
}

/**
 * Quick check — returns a 422 response body or null.
 * Use in API routes: const err = await revisionError(spoolId, 'WELD'); if (err) return err;
 */
export async function revisionError(
  spoolId: string,
  workType: 'WELD' | 'NDE' | 'INSPECTION' | 'PRESSURE_TEST',
  bypass = false,
): Promise<{ status: number; body: object } | null> {
  const result = await checkRevision(spoolId, workType, bypass);
  if (result.ok) return null;
  if (!result.block) return null; // warning only — caller shows it but doesn't block
  return {
    status: 422,
    body: {
      error: result.reason,
      code: 'DRAWING_REVISION_BLOCKED',
      drawing: result.drawingNumber,
      revision: result.revision,
      drawingStatus: result.drawingStatus,
    },
  };
}
