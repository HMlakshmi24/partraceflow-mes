import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('route redirects', () => {
  it('maps legacy routes to stable destinations', async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toBeDefined();
    const rules = redirects ?? [];
    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: '/machine-health', destination: '/maintenance' }),
      expect.objectContaining({ source: '/product-history', destination: '/traceability' }),
      expect.objectContaining({ source: '/ai-assistant', destination: '/copilot' }),
    ]));
  });
});
