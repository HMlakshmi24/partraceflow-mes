/**
 * In-memory rate limiter — suitable for single-instance deployments.
 * For multi-node deployments, replace with a Redis-backed store (e.g., @upstash/ratelimit).
 *
 * Usage:
 *   const result = rateLimit(ip, { limit: 30, windowMs: 60_000 });
 *   if (!result.allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
 */

interface Entry { count: number; resetAt: number; }

const store = new Map<string, Entry>();

// Clean up old entries every 5 minutes to prevent memory leak
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store) {
            if (entry.resetAt < now) store.delete(key);
        }
    }, 5 * 60 * 1000);
}

export interface RateLimitOptions {
    limit: number;      // max requests per window
    windowMs: number;   // window in milliseconds
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterMs: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + opts.windowMs };
        store.set(key, entry);
    }

    entry.count++;
    const remaining = Math.max(0, opts.limit - entry.count);
    const allowed = entry.count <= opts.limit;

    return {
        allowed,
        remaining,
        resetAt: entry.resetAt,
        retryAfterMs: allowed ? 0 : entry.resetAt - now,
    };
}

// Preset limiters
export const authLimiter = (ip: string) => rateLimit(`auth:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });       // 10 per 15min
export const apiLimiter  = (ip: string) => rateLimit(`api:${ip}`,  { limit: 300, windowMs: 60 * 1000 });             // 300 per minute
export const demoLimiter = (ip: string) => rateLimit(`demo:${ip}`, { limit: 5, windowMs: 5 * 60 * 1000 });           // 5 per 5min (seed/tick)
