export function computeReconnectDelay(attempt: number): number {
  const normalized = Math.max(0, attempt);
  return Math.min(30000, 1000 * Math.max(1, 2 ** normalized));
}

export function buildEventDedupKey(event: { type: string; machineId?: string; workOrderId?: string; payload?: unknown }): string {
  return `${event.type}:${event.machineId ?? ''}:${event.workOrderId ?? ''}:${JSON.stringify(event.payload ?? {})}`;
}

