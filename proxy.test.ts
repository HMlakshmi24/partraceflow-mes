import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { proxy } from './proxy';
import { SESSION_COOKIE } from './lib/auth';

// Regression coverage for a real bug found during MFA E2E testing: the
// ALWAYS_REACHABLE_WHILE_GATED branch (/api/session, /api/auth/logout) set
// x-mes-user-id/username/role but not x-mes-session-version, so
// getRequestSession()/isSessionValid() (lib/api-auth.ts) silently skipped
// the revocation check for those two routes — a session revoked by an admin
// action (password reset, MFA reset, deactivation) still read back as
// authenticated:true from GET /api/session until the token's natural
// expiry. Caught via live HTTP testing, not by any prior unit test, because
// nothing exercised proxy.ts's header-forwarding directly.

const SESSION_SECRET = 'proxy-test-secret';

function signToken(payload: Record<string, unknown>): string {
    const now = Math.floor(Date.now() / 1000);
    const full = { ...payload, iat: now, exp: now + 1800 };
    const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

function requestWithSession(pathname: string, payload: Record<string, unknown>): NextRequest {
    const token = signToken(payload);
    const req = new NextRequest(new URL(pathname, 'http://localhost:3000'));
    req.cookies.set(SESSION_COOKIE, token);
    return req;
}

// NextResponse.next({ request: { headers } }) doesn't set headers on the
// response itself — it smuggles the modified *request* headers back via
// `x-middleware-request-<name>` + `x-middleware-override-headers` (see
// next/dist/server/web/spec-extension/response.js), which Next's internal
// routing layer unpacks before invoking the real page/route handler. Tests
// need to read that encoding, not res.headers directly.
function forwardedRequestHeader(res: Response, name: string): string | null {
    return res.headers.get(`x-middleware-request-${name}`);
}

describe('proxy.ts — session header forwarding', () => {
    beforeAll(() => {
        process.env.SESSION_SECRET = SESSION_SECRET;
    });

    const basePayload = {
        userId: 'u1', username: 'alice', role: 'OPERATOR',
        mustChangePassword: false, mfaEnabled: true, mfaVerified: true,
        sessionVersion: 7,
    };

    it('forwards x-mes-session-version on the normal (fall-through) path', async () => {
        const req = requestWithSession('/dashboard', basePayload);
        const res = await proxy(req);
        expect(forwardedRequestHeader(res, 'x-mes-session-version')).toBe('7');
    });

    it('also forwards x-mes-session-version for /api/session (ALWAYS_REACHABLE_WHILE_GATED)', async () => {
        const req = requestWithSession('/api/session', basePayload);
        const res = await proxy(req);
        expect(forwardedRequestHeader(res, 'x-mes-session-version')).toBe('7');
    });

    it('also forwards x-mes-session-version for /api/auth/logout (ALWAYS_REACHABLE_WHILE_GATED)', async () => {
        const req = requestWithSession('/api/auth/logout', basePayload);
        const res = await proxy(req);
        expect(forwardedRequestHeader(res, 'x-mes-session-version')).toBe('7');
    });

    it('still forwards user/username/role on ALWAYS_REACHABLE_WHILE_GATED paths', async () => {
        const req = requestWithSession('/api/session', basePayload);
        const res = await proxy(req);
        expect(forwardedRequestHeader(res, 'x-mes-user-id')).toBe('u1');
        expect(forwardedRequestHeader(res, 'x-mes-username')).toBe('alice');
        expect(forwardedRequestHeader(res, 'x-mes-role')).toBe('OPERATOR');
    });

    it('reaches /api/session even while MFA-ungated (mustChangePassword true)', async () => {
        const req = requestWithSession('/api/session', { ...basePayload, mustChangePassword: true, mfaVerified: false });
        const res = await proxy(req);
        // ALWAYS_REACHABLE_WHILE_GATED short-circuits before the
        // mustChangePassword/MFA gates — no redirect, headers set directly.
        expect(res.headers.get('location')).toBeNull();
        expect(forwardedRequestHeader(res, 'x-mes-session-version')).toBe('7');
    });

    it('reaches /api/session even while MFA-ungated (mfaEnabled false)', async () => {
        const req = requestWithSession('/api/session', { ...basePayload, mfaEnabled: false, mfaVerified: false });
        const res = await proxy(req);
        expect(res.headers.get('location')).toBeNull();
        expect(forwardedRequestHeader(res, 'x-mes-session-version')).toBe('7');
    });
});

describe('proxy.ts — mandatory MFA gate', () => {
    beforeAll(() => {
        process.env.SESSION_SECRET = SESSION_SECRET;
    });

    const enrolled = { userId: 'u1', username: 'alice', role: 'OPERATOR', mustChangePassword: false, sessionVersion: 1 };

    it('redirects an unenrolled user (mfaEnabled=false) to /mfa-setup', async () => {
        const req = requestWithSession('/dashboard', { ...enrolled, mfaEnabled: false, mfaVerified: false });
        const res = await proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/mfa-setup');
    });

    it('403s an API call from an unenrolled user instead of redirecting', async () => {
        const req = requestWithSession('/api/orders', { ...enrolled, mfaEnabled: false, mfaVerified: false });
        const res = await proxy(req);
        expect(res.status).toBe(403);
    });

    it('redirects an enrolled-but-unverified user to /mfa-verify', async () => {
        const req = requestWithSession('/dashboard', { ...enrolled, mfaEnabled: true, mfaVerified: false });
        const res = await proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/mfa-verify');
    });

    it('lets an enrolled + verified user through to a normal page', async () => {
        const req = requestWithSession('/dashboard', { ...enrolled, mfaEnabled: true, mfaVerified: true });
        const res = await proxy(req);
        expect(res.headers.get('location')).toBeNull();
    });

    it('does not redirect to /mfa-verify while still on /mfa-setup', async () => {
        const req = requestWithSession('/mfa-setup', { ...enrolled, mfaEnabled: false, mfaVerified: false });
        const res = await proxy(req);
        expect(res.headers.get('location')).toBeNull();
    });

    it('mustChangePassword takes priority over the MFA gate', async () => {
        const req = requestWithSession('/dashboard', { ...enrolled, mustChangePassword: true, mfaEnabled: false, mfaVerified: false });
        const res = await proxy(req);
        expect(res.headers.get('location')).toContain('/change-password');
    });
});
