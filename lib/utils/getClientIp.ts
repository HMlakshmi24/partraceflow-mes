import type { NextRequest } from 'next/server';

/**
 * HIGH-13 fix: the previous code took the *first* entry in X-Forwarded-For
 * (`.split(',')[0]`) — but this app's own nginx config
 * (deploy/nginx/default.conf) sets `X-Forwarded-For: $proxy_add_x_forwarded_for`,
 * which *appends* the real client IP to whatever XFF value the client
 * already sent, rather than replacing it. A client can send
 * `X-Forwarded-For: 1.2.3.4` itself; nginx forwards
 * `X-Forwarded-For: 1.2.3.4, <real-client-ip>` — so taking the first entry
 * used the attacker-controlled value, and a client could get a fresh
 * rate-limit bucket on every login attempt just by sending a different fake
 * first entry. With exactly one trusted reverse proxy in front of the app
 * (true for both this app's nginx and Vercel's edge, which also appends
 * rather than trusting client-supplied XFF), the *last* entry is the one
 * that proxy itself observed and appended — not client-suppliable.
 */
export function getClientIp(req: NextRequest): string {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
        const parts = xff.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length > 0) return parts[parts.length - 1];
    }
    return req.headers.get('x-real-ip') ?? 'unknown';
}
