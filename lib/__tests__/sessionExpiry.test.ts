import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('session expiry policies', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SESSION_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses default timeout for non-operator sessions', async () => {
    vi.stubEnv('MES_SESSION_TIMEOUT_SECS', '1800');
    vi.stubEnv('MES_OPERATOR_TERMINAL_MODE', '1');
    vi.stubEnv('MES_OPERATOR_SESSION_TIMEOUT_SECS', '28800');
    const auth = await import('@/lib/auth');
    const token = auth.createSessionToken({ userId: 'u1', username: 'a', role: 'ADMIN' });
    const payload = auth.verifySessionToken(token);
    expect(payload).toBeTruthy();
    expect((payload!.exp - payload!.iat)).toBe(1800);
  });

  it('uses extended timeout for operator terminal mode', async () => {
    vi.stubEnv('MES_SESSION_TIMEOUT_SECS', '1800');
    vi.stubEnv('MES_OPERATOR_TERMINAL_MODE', '1');
    vi.stubEnv('MES_OPERATOR_SESSION_TIMEOUT_SECS', '28800');
    const auth = await import('@/lib/auth');
    const token = auth.createSessionToken({ userId: 'u2', username: 'op', role: 'OPERATOR' });
    const payload = auth.verifySessionToken(token);
    expect(payload).toBeTruthy();
    expect((payload!.exp - payload!.iat)).toBe(28800);
  });
});

