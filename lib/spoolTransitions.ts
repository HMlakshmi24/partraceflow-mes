// ── Spool state machine ────────────────────────────────────────────────────────
//
// Full fabrication pipeline:
// FABRICATING → RECEIVED → IN_STORAGE → ISSUED → FIT_UP → WELDED
//   → [PWHT] → NDE_PENDING → NDE_CLEAR → PRESSURE_TESTED
//   → COATING → MARKING → COMPLETE
//
// HOLD is reachable from every non-terminal state and can return to any
// non-terminal state (including NDE_CLEAR — Bug 1 fix).
// REPAIR is a sub-loop off NDE_PENDING.

export const SPOOL_TRANSITIONS: Record<string, string[]> = {
  FABRICATING:      ['RECEIVED', 'HOLD'],
  RECEIVED:         ['IN_STORAGE', 'HOLD'],
  IN_STORAGE:       ['ISSUED', 'HOLD'],
  ISSUED:           ['FIT_UP', 'IN_STORAGE', 'HOLD'],
  FIT_UP:           ['WELDED', 'ISSUED', 'HOLD'],
  WELDED:           ['PWHT', 'NDE_PENDING', 'HOLD'],        // PWHT is now a valid next step
  PWHT:             ['NDE_PENDING', 'HOLD'],
  NDE_PENDING:      ['NDE_CLEAR', 'REPAIR', 'HOLD'],
  NDE_CLEAR:        ['PRESSURE_TESTED', 'COATING', 'COMPLETE', 'HOLD'], // Bug 1 fixed: HOLD added
  REPAIR:           ['NDE_PENDING', 'HOLD'],
  PRESSURE_TESTED:  ['COATING', 'COMPLETE', 'HOLD'],
  COATING:          ['MARKING', 'COMPLETE', 'HOLD'],
  MARKING:          ['COMPLETE', 'HOLD'],
  HOLD: [
    'FABRICATING', 'RECEIVED', 'IN_STORAGE', 'ISSUED',
    'FIT_UP', 'WELDED', 'PWHT',
    'NDE_PENDING', 'NDE_CLEAR', 'REPAIR',                  // Bug 1 fixed: NDE_CLEAR added
    'PRESSURE_TESTED', 'COATING', 'MARKING',
  ],
  COMPLETE: [],
};

// ── Joint state machine ────────────────────────────────────────────────────────
//
// Joint sub-flow inside each spool:
// PENDING → CUT → BEVELED → FIT_UP → WELDED
//   → NDE_PENDING → NDE_CLEAR → COMPLETE
//   (NDE_PENDING → REPAIR → NDE_PENDING is the repair loop)
//
// FIT_UP is reachable directly from PENDING for shops that don't track cutting.

export const JOINT_TRANSITIONS: Record<string, string[]> = {
  PENDING:    ['CUT', 'FIT_UP', 'HOLD'],
  CUT:        ['BEVELED', 'FIT_UP', 'HOLD'],              // can skip bevel and go straight to fit-up
  BEVELED:    ['FIT_UP', 'HOLD'],
  FIT_UP:     ['WELDED', 'BEVELED', 'PENDING', 'HOLD'],
  WELDED:     ['NDE_PENDING', 'HOLD'],
  NDE_PENDING:['NDE_CLEAR', 'REPAIR', 'HOLD'],
  NDE_CLEAR:  ['COMPLETE', 'HOLD'],
  REPAIR:     ['NDE_PENDING', 'HOLD'],
  HOLD: [
    'PENDING', 'CUT', 'BEVELED', 'FIT_UP',               // Bug 2 fixed: CUT, BEVELED added
    'WELDED', 'NDE_PENDING', 'REPAIR', 'NDE_CLEAR',       // Bug 2 fixed: NDE_CLEAR added
  ],
  COMPLETE: [],
};

// ── Guards ────────────────────────────────────────────────────────────────────

export function canTransition(
  table: Record<string, string[]>,
  from: string,
  to: string,
): boolean {
  return (table[from] ?? []).includes(to);
}

export function spoolTransitionError(from: string, to: string): string {
  const allowed = SPOOL_TRANSITIONS[from] ?? [];
  return allowed.length
    ? `Cannot move spool from ${from} → ${to}. Allowed next: ${allowed.join(', ')}`
    : `Spool is COMPLETE — no further transitions allowed`;
}

export function jointTransitionError(from: string, to: string): string {
  const allowed = JOINT_TRANSITIONS[from] ?? [];
  return allowed.length
    ? `Cannot move joint from ${from} → ${to}. Allowed next: ${allowed.join(', ')}`
    : `Joint is COMPLETE — no further transitions allowed`;
}
