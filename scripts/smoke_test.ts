// Simple smoke test to exercise key app endpoints.
// Run with: npx ts-node scripts/smoke_test.ts

import fetch from 'node-fetch';
import { loginWithFallback } from './test_auth.ts';

async function run() {
    const base = 'http://localhost:3000';

    const { cookie } = await loginWithFallback(base, [
        { username: 'admin', password: 'admin123' },
        { username: 'planner', password: 'demo' },
        { username: 'operator', password: 'demo' },
    ]);
    const authHeaders = { Cookie: cookie };

    console.log('GET /api/orders');
    console.log(await fetchJson(base + '/api/orders', 'GET', undefined, authHeaders));

    console.log('POST /api/designer (save)');
    const smokePayload = {
        nodes: [
            { id: 'start', type: 'start', title: 'Start', next: ['end'] },
            { id: 'end', type: 'end', title: 'End' }
        ]
    };
    const saveResult = await fetchJson(base + '/api/designer', 'POST', { name: 'smoke-wf', payload: JSON.stringify(smokePayload) }, authHeaders);
    console.log(saveResult);
    const workflowId = saveResult?.workflow?.id;

    console.log('POST /api/designer/deploy');
    console.log(await fetchJson(base + '/api/designer/deploy', 'POST', { name: 'smoke-wf' }, authHeaders));

    console.log('POST /api/workflows start');
    if (!workflowId) {
        console.log({ success: false, error: 'No workflow id returned from /api/designer' });
    } else {
        console.log(await fetchJson(base + '/api/workflows', 'POST', { action: 'start', processId: workflowId }, authHeaders));
    }

    console.log('POST /api/events (simulate)');
    console.log(await fetchJson(base + '/api/events', 'POST', { source: 'simulator', eventType: 'RFID_READ', details: { tag: 'TAG-123' } }, authHeaders));
}

async function fetchJson(url: string, method = 'GET', body?: any, extraHeaders?: Record<string, string>) {
    const opts: any = { method, headers: { ...(extraHeaders ?? {}) } };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
}

run().catch(e => { console.error('Smoke test failed:', e); process.exit(1); });
