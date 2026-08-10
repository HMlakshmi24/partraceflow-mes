import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRawMock = vi.fn();
const runtimeFindManyMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock('@/lib/services/database', () => ({
  prisma: {
    $queryRaw: queryRawMock,
    machineRuntime: { findMany: runtimeFindManyMock },
  },
}));

vi.mock('@/lib/services/MQTTService', () => ({
  MQTTService: { isConnected: true },
}));

vi.mock('@/lib/events/EventBus', () => ({
  eventBus: { listenerCount: vi.fn(() => 1) },
}));

vi.mock('@/lib/services/ErrorTrackingService', () => ({
  ErrorTrackingService: { captureException: captureExceptionMock },
}));

describe('Health API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([1]);
    runtimeFindManyMock.mockResolvedValue([]);
  });

  it('returns expected shallow health shape', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({
      database: true,
      mqtt: true,
      realtime: true,
      demoMode: expect.any(Boolean),
      version: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('returns deep health checks', async () => {
    const { GET } = await import('@/app/api/health/deep/route');
    const res = await GET();
    const body = await res.json();
    expect(body.checks).toEqual({
      dbQuery: true,
      mqttConnection: true,
      eventBusState: true,
      runtimeTableQuery: true,
    });
  });

  it('tracks database failure in deep health', async () => {
    queryRawMock.mockRejectedValueOnce(new Error('db down'));
    const { GET } = await import('@/app/api/health/deep/route');
    const res = await GET();
    const body = await res.json();
    expect(body.checks.dbQuery).toBe(false);
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it('sets runtimeTableQuery false when runtime query fails', async () => {
    runtimeFindManyMock.mockRejectedValueOnce(new Error('runtime fail'));
    const { GET } = await import('@/app/api/health/deep/route');
    const res = await GET();
    const body = await res.json();
    expect(body.checks.runtimeTableQuery).toBe(false);
  });

  it('shallow health marks database false when query fails', async () => {
    queryRawMock.mockRejectedValueOnce(new Error('db fail'));
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();
    expect(body.database).toBe(false);
  });

  it('deep response includes timestamp string', async () => {
    const { GET } = await import('@/app/api/health/deep/route');
    const res = await GET();
    const body = await res.json();
    expect(typeof body.timestamp).toBe('string');
  });

  it('shallow response includes timestamp string', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();
    expect(typeof body.timestamp).toBe('string');
  });

  it('deep health sets mqttConnection from MQTTService state', async () => {
    const { GET } = await import('@/app/api/health/deep/route');
    const res = await GET();
    const body = await res.json();
    expect(body.checks.mqttConnection).toBe(true);
  });

  it('deep health sets eventBusState true for valid listener count', async () => {
    const { GET } = await import('@/app/api/health/deep/route');
    const res = await GET();
    const body = await res.json();
    expect(body.checks.eventBusState).toBe(true);
  });

  it('shallow health includes boolean realtime indicator', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();
    expect(typeof body.realtime).toBe('boolean');
  });

  it('shallow health includes boolean demoMode indicator', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();
    expect(typeof body.demoMode).toBe('boolean');
  });
});
