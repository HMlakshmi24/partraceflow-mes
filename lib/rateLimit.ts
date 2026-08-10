/**
 * Rate limiter — Upstash Redis when credentials are present,
 * in-memory sliding-window token bucket otherwise.
 *
 * The in-memory fallback is suitable for single-node / local deployments.
 * In a multi-replica deployment without Redis every instance has its own
 * counter, so configure UPSTASH_REDIS_REST_URL/TOKEN in production.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('rateLimit');

export interface RateLimitOptions {
    limit: number;
    windowMs: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterMs: number;
}

// ── In-memory store (single-node fallback) ─────────────────────────────────────

interface Bucket {
    timestamps: number[];
    expiresAt: number;
}

const memoryStore = new Map<string, Bucket>();

function memoryRateLimit(key: string, opts: RateLimitOptions, increment: boolean): RateLimitResult {
    const now = Date.now();
    const windowStart = now - opts.windowMs;

    // Prune expired keys
    if (memoryStore.size > 50_000) {
        for (const [k, v] of memoryStore) {
            if (v.expiresAt < now) memoryStore.delete(k);
        }
    }

    let bucket = memoryStore.get(key);
    if (!bucket || bucket.expiresAt < now) {
        bucket = { timestamps: [], expiresAt: now + opts.windowMs };
        memoryStore.set(key, bucket);
    }

    // Slide the window
    bucket.timestamps = bucket.timestamps.filter(t => t > windowStart);

    if (increment) {
        bucket.timestamps.push(now);
        bucket.expiresAt = now + opts.windowMs;
    }

    const count = bucket.timestamps.length;
    const allowed = count <= opts.limit;
    const resetAt = Math.min(...bucket.timestamps, now) + opts.windowMs;

    return {
        allowed,
        remaining: Math.max(0, opts.limit - count),
        resetAt,
        retryAfterMs: allowed ? 0 : resetAt - now,
    };
}

// ── Redis (Upstash) implementation ─────────────────────────────────────────────

async function redisRateLimit(
    key: string,
    opts: RateLimitOptions,
    increment: boolean,
    url: string,
    token: string,
): Promise<RateLimitResult> {
    const now = Date.now();

    if (!increment) {
        const getRes = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
        const getBody = await getRes.json() as { result?: string | null };
        const currentCount = parseInt(getBody.result ?? '0', 10);
        const allowed = currentCount < opts.limit;
        return {
            allowed,
            remaining: Math.max(0, opts.limit - currentCount),
            resetAt: now + opts.windowMs,
            retryAfterMs: allowed ? 0 : opts.windowMs,
        };
    }

    const res = await fetch(`${url}/incr/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json() as { result?: string | number | null };
    const count = body.result ? parseInt(String(body.result), 10) : 1;

    if (count === 1) {
        await fetch(`${url}/pexpire/${key}/${opts.windowMs}`, { headers: { Authorization: `Bearer ${token}` } });
    }

    const allowed = count <= opts.limit;
    return {
        allowed,
        remaining: Math.max(0, opts.limit - count),
        resetAt: now + opts.windowMs,
        retryAfterMs: allowed ? 0 : opts.windowMs,
    };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function rateLimit(key: string, opts: RateLimitOptions, increment = true): Promise<RateLimitResult> {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        return memoryRateLimit(key, opts, increment);
    }

    try {
        return await redisRateLimit(key, opts, increment, url, token);
    } catch (err) {
        log.warn('Redis rate-limit failed, falling back to in-memory', { message: (err as Error).message });
        return memoryRateLimit(key, opts, increment);
    }
}

export const authFailureLimiter      = (ip: string, username: string) =>
    rateLimit(`auth:${ip}:${username.toLowerCase()}`, { limit: 5,   windowMs: 15 * 60 * 1000 }, true);

export const authCheckFailureLimiter = (ip: string, username: string) =>
    rateLimit(`auth:${ip}:${username.toLowerCase()}`, { limit: 5,   windowMs: 15 * 60 * 1000 }, false);

export const apiLimiter  = (ip: string) => rateLimit(`api:${ip}`,  { limit: 300, windowMs: 60 * 1000 });
export const demoLimiter = (ip: string) => rateLimit(`demo:${ip}`, { limit: 5,   windowMs: 5 * 60 * 1000 });
