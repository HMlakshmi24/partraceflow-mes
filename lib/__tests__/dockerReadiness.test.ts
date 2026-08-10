import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('deployment readiness artifacts', () => {
  const root = path.resolve(process.cwd());

  it('includes compose healthchecks and startup dependency ordering', () => {
    const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('healthcheck:');
    expect(compose).toContain('depends_on:');
    expect(compose).toContain('condition: service_healthy');
  });

  it('nginx config disables buffering for SSE stream', () => {
    const nginx = fs.readFileSync(path.join(root, 'deploy', 'nginx', 'default.conf'), 'utf-8');
    expect(nginx).toContain('location /api/stream');
    expect(nginx).toContain('proxy_buffering off;');
  });
});

