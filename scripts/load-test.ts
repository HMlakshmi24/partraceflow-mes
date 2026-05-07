#!/usr/bin/env npx ts-node --esm
/**
 * MES Load Test
 * Usage: npx ts-node scripts/load-test.ts [baseUrl] [concurrency] [iterations]
 * Example: npx ts-node scripts/load-test.ts http://localhost:3000 10 50
 */

const BASE   = process.argv[2] ?? 'http://localhost:3000';
const CONCUR = parseInt(process.argv[3] ?? '10', 10);
const ITERS  = parseInt(process.argv[4] ?? '50', 10);

// Credentials for a demo ADMIN user — override with env vars
const USERNAME = process.env.LT_USERNAME ?? 'admin';
const PASSWORD = process.env.LT_PASSWORD ?? 'admin123';

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/mes-session=([^;]+)/);
  if (!match) throw new Error('No session cookie in login response');
  return match[1];
}

async function probe(cookie: string, path: string): Promise<{ durationMs: number; status: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: `mes-session=${cookie}` },
  });
  return { durationMs: Date.now() - t0, status: res.status };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

const ENDPOINTS = [
  '/api/health',
  '/api/reports/production',
  '/api/reports/qc',
  '/api/reports/operator',
  '/api/rfid/readers',
  '/api/machines',
];

async function main() {
  console.log(`MES Load Test — ${BASE} | concurrency=${CONCUR} | iterations=${ITERS}`);

  let cookie: string;
  try {
    cookie = await login();
    console.log('Login OK\n');
  } catch (e: any) {
    console.error('Cannot login:', e.message);
    process.exit(1);
  }

  const results: Record<string, { durations: number[]; errors: number }> = {};
  for (const ep of ENDPOINTS) results[ep] = { durations: [], errors: 0 };

  const tasks: Array<() => Promise<void>> = [];
  for (let i = 0; i < ITERS; i++) {
    const ep = ENDPOINTS[i % ENDPOINTS.length];
    tasks.push(async () => {
      try {
        const r = await probe(cookie, ep);
        results[ep].durations.push(r.durationMs);
        if (r.status >= 400) results[ep].errors++;
      } catch {
        results[ep].errors++;
      }
    });
  }

  // Run with bounded concurrency
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const task = tasks[idx++];
      await task();
    }
  }
  await Promise.all(Array.from({ length: CONCUR }, worker));

  console.log('Results:\n');
  console.log('Endpoint'.padEnd(40), 'Reqs'.padEnd(6), 'Errors'.padEnd(8), 'P50'.padEnd(8), 'P95'.padEnd(8), 'P99');
  console.log('─'.repeat(80));

  for (const ep of ENDPOINTS) {
    const { durations, errors } = results[ep];
    if (!durations.length) { console.log(ep.padEnd(40), '0'); continue; }
    const sorted = [...durations].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    console.log(
      ep.padEnd(40),
      String(durations.length).padEnd(6),
      String(errors).padEnd(8),
      `${p50}ms`.padEnd(8),
      `${p95}ms`.padEnd(8),
      `${p99}ms`,
    );
  }

  const allErrors = Object.values(results).reduce((s, r) => s + r.errors, 0);
  const allReqs   = Object.values(results).reduce((s, r) => s + r.durations.length, 0);
  console.log('\n' + '─'.repeat(80));
  console.log(`Total requests: ${allReqs}  Errors: ${allErrors}  Error rate: ${allReqs ? (allErrors / allReqs * 100).toFixed(1) : 0}%`);
}

main().catch(e => { console.error(e); process.exit(1); });
