export const SPOOL_TRANSITIONS: Record<string, string[]> = {
  FABRICATING: ['RECEIVED', 'HOLD'],
  RECEIVED: ['IN_STORAGE', 'HOLD'],
  IN_STORAGE: ['ISSUED', 'HOLD'],
  ISSUED: ['FIT_UP', 'IN_STORAGE', 'HOLD'],
  FIT_UP: ['WELDED', 'ISSUED', 'HOLD'],
  WELDED: ['NDE_PENDING', 'HOLD'],
  NDE_PENDING: ['NDE_CLEAR', 'REPAIR', 'HOLD'],
  NDE_CLEAR: ['PRESSURE_TESTED', 'COMPLETE'],
  REPAIR: ['NDE_PENDING', 'HOLD'],
  PRESSURE_TESTED: ['COMPLETE', 'HOLD'],
  HOLD: [
    'FABRICATING',
    'RECEIVED',
    'IN_STORAGE',
    'ISSUED',
    'FIT_UP',
    'WELDED',
    'NDE_PENDING',
    'REPAIR',
  ],
  COMPLETE: [],
};

export const JOINT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['FIT_UP', 'HOLD'],
  FIT_UP: ['WELDED', 'PENDING', 'HOLD'],
  WELDED: ['NDE_PENDING', 'HOLD'],
  NDE_PENDING: ['NDE_CLEAR', 'REPAIR', 'HOLD'],
  NDE_CLEAR: ['COMPLETE', 'HOLD'],
  REPAIR: ['NDE_PENDING', 'HOLD'],
  HOLD: ['PENDING', 'FIT_UP', 'WELDED', 'NDE_PENDING', 'REPAIR'],
  COMPLETE: [],
};

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
