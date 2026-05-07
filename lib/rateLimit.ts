/**
 * Distributed rate limiter — Redis/Upstash backed for serverless deployments.
 */

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

export async function rateLimit(key: string, opts: RateLimitOptions, increment: boolean = true): Promise<RateLimitResult> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const now = Date.now();

    try {
        if (!url || !token) {
            console.warn('[RateLimiter] Missing Upstash Redis credentials. Using dummy passthrough.');
            return { allowed: true, remaining: opts.limit, resetAt: now + opts.windowMs, retryAfterMs: 0 };
        }

        if (!increment) {
            // Just fetch the current value
            const getRes = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } });
            const getBody = await getRes.json();
            const currentCount = parseInt(getBody.result ?? '0', 10);
            const allowed = currentCount < opts.limit;
            return {
                allowed,
                remaining: Math.max(0, opts.limit - currentCount),
                resetAt: now + opts.windowMs,
                retryAfterMs: allowed ? 0 : opts.windowMs,
            };
        }

        // Atomic INCR
        const res = await fetch(`${url}/incr/${key}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        const count = body.result ? parseInt(body.result.toString(), 10) : 1;

        // Set expiration if this is the first increment in the window
        if (count === 1) {
            await fetch(`${url}/pexpire/${key}/${opts.windowMs}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
        }

        const allowed = count <= opts.limit;
        return {
            allowed,
            remaining: Math.max(0, opts.limit - count),
            resetAt: now + opts.windowMs,
            retryAfterMs: allowed ? 0 : opts.windowMs,
        };
    } catch (err) {
        console.error('[RateLimiter] Redis error:', err);
        // Fail OPEN to avoid blocking users on cache failure
        return { allowed: true, remaining: opts.limit, resetAt: now + opts.windowMs, retryAfterMs: 0 };
    }
}

// Preset limiters focusing on username & IP explicitly combined per requirements
export const authFailureLimiter = (ip: string, username: string) =>
    rateLimit(`auth:${ip}:${username.toLowerCase()}`, { limit: 5, windowMs: 15 * 60 * 1000 }, true);

// Pre-flight check without incrementing to block before even processing the body
export const authCheckFailureLimiter = (ip: string, username: string) =>
    rateLimit(`auth:${ip}:${username.toLowerCase()}`, { limit: 5, windowMs: 15 * 60 * 1000 }, false);

export const apiLimiter = (ip: string) => rateLimit(`api:${ip}`, { limit: 300, windowMs: 60 * 1000 });
export const demoLimiter = (ip: string) => rateLimit(`demo:${ip}`, { limit: 5, windowMs: 5 * 60 * 1000 });
