import { describe, it, expect } from 'vitest';
import { computeReconnectDelay, buildEventDedupKey } from '@/lib/sseUtils';

describe('SSE reconnect and dedupe utilities', () => {
  it('computes bounded exponential reconnect delays', () => {
    expect(computeReconnectDelay(0)).toBe(1000);
    expect(computeReconnectDelay(1)).toBe(2000);
    expect(computeReconnectDelay(5)).toBe(30000);
    expect(computeReconnectDelay(10)).toBe(30000);
  });

  it('builds stable dedupe keys for equivalent events', () => {
    const a = buildEventDedupKey({ type: 'machine.status.changed', machineId: 'm1', payload: { status: 'RUNNING' } });
    const b = buildEventDedupKey({ type: 'machine.status.changed', machineId: 'm1', payload: { status: 'RUNNING' } });
    expect(a).toBe(b);
  });
});

