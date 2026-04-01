export const SPOOL_STATUSES = [
  'FABRICATING',
  'RECEIVED',
  'IN_STORAGE',
  'ISSUED',
  'FIT_UP',
  'WELDED',
  'NDE_PENDING',
  'REPAIR',
  'NDE_CLEAR',
  'PRESSURE_TESTED',
  'HOLD',
  'COMPLETE',
] as const;

export const JOINT_STATUSES = [
  'PENDING',
  'FIT_UP',
  'WELDED',
  'NDE_PENDING',
  'REPAIR',
  'NDE_CLEAR',
  'HOLD',
  'COMPLETE',
] as const;

export type SpoolStatus = typeof SPOOL_STATUSES[number];
export type JointStatus = typeof JOINT_STATUSES[number];

export const SPOOL_STATUS_COLORS: Record<string, string> = {
  FABRICATING: '#f59e0b',
  RECEIVED: '#3b82f6',
  IN_STORAGE: '#8b5cf6',
  ISSUED: '#06b6d4',
  FIT_UP: '#f59e0b',
  WELDED: '#f59e0b',
  NDE_PENDING: '#8b5cf6',
  REPAIR: '#f97316',
  NDE_CLEAR: '#06b6d4',
  PRESSURE_TESTED: '#14b8a6',
  HOLD: '#ef4444',
  COMPLETE: '#22c55e',
};

export const JOINT_STATUS_COLORS: Record<string, string> = {
  PENDING: '#94a3b8',
  FIT_UP: '#3b82f6',
  WELDED: '#f59e0b',
  NDE_PENDING: '#8b5cf6',
  REPAIR: '#f97316',
  NDE_CLEAR: '#06b6d4',
  HOLD: '#ef4444',
  COMPLETE: '#22c55e',
};

export const SPOOL_FLOW_STEPS = [
  { id: 'FABRICATING', label: 'FABRICATING', statuses: ['FABRICATING'] },
  { id: 'RECEIVED', label: 'RECEIVED', statuses: ['RECEIVED'] },
  { id: 'IN_STORAGE', label: 'IN STORAGE', statuses: ['IN_STORAGE'] },
  { id: 'ISSUED', label: 'ISSUED', statuses: ['ISSUED'] },
  { id: 'FIT_UP', label: 'FIT UP', statuses: ['FIT_UP'] },
  { id: 'WELDED', label: 'WELDED', statuses: ['WELDED'] },
  { id: 'NDE', label: 'NDE', statuses: ['NDE_PENDING', 'NDE_CLEAR', 'REPAIR'] },
  { id: 'TEST', label: 'TEST', statuses: ['PRESSURE_TESTED'] },
  { id: 'COMPLETE', label: 'COMPLETE', statuses: ['COMPLETE'] },
] as const;

export function getSpoolFlowStepIndex(status: string): number | null {
  for (let i = 0; i < SPOOL_FLOW_STEPS.length; i++) {
    if ((SPOOL_FLOW_STEPS[i].statuses as readonly string[]).includes(status)) return i;
  }
  return null;
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
