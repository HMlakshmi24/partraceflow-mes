/**
 * Auth utilities — server-side only (Node.js runtime)
 *
 * Password hashing: crypto.scrypt  (NIST-recommended KDF)
 * Session tokens:   HMAC-SHA256 signed, base64url encoded
 *
 * Set SESSION_SECRET in .env for production.
 */

import crypto from 'crypto';

// Lazy getter — throws at request time (not build time) if secret is missing in production
function getSecret(): string {
    const secret = process.env.SESSION_SECRET ?? 'mes-dev-secret-CHANGE-IN-PRODUCTION';
    if (process.env.NODE_ENV === 'production' && secret === 'mes-dev-secret-CHANGE-IN-PRODUCTION') {
        throw new Error(
            '[MES] SESSION_SECRET is not configured. Set a strong random value in Vercel › Settings › Environment Variables. ' +
            'Generate one with: openssl rand -base64 32'
        );
    }
    return secret;
}

function parseEnvInt(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DEFAULT_SESSION_EXPIRY_SECS = parseEnvInt('MES_SESSION_TIMEOUT_SECS', 1800);
const OPERATOR_TERMINAL_SESSION_EXPIRY_SECS = parseEnvInt('MES_OPERATOR_SESSION_TIMEOUT_SECS', 8 * 3600);
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEY_LEN = 64;

// ─── Password ──────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
    try {
        const [, N, r, p, salt, hash] = stored.split('$');
        const derived = crypto.scryptSync(password, salt, KEY_LEN, {
            N: parseInt(N), r: parseInt(r), p: parseInt(p),
        }).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
    } catch {
        return false;
    }
}

// ─── Session Token ─────────────────────────────────────────────────────────

export interface SessionPayload {
    userId: string;
    username: string;
    role: string;
    mustChangePassword?: boolean;
    sessionVersion?: number;
    /** Whether the account has completed MFA enrollment (User.mfaEnabled). */
    mfaEnabled?: boolean;
    /** Whether *this* session has passed its second-factor check yet. Set
     * false at login/password-change (a new authentication event always
     * requires a fresh MFA check) and true once mfa/verify or mfa/validate
     * succeeds. /api/session/refresh must copy the *current* token's value
     * forward rather than resetting it — refresh extends an already-verified
     * session, it isn't a new authentication event. */
    mfaVerified?: boolean;
    exp: number;
    iat: number;
}

/**
 * Pure helper — returns true when the token's session version matches the DB value
 * and the user is active. Exported for unit testing without DB.
 */
export function isSessionValid(
    tokenVersion: number | undefined,
    dbVersion: number,
    isActive: boolean,
): boolean {
    if (!isActive) return false;
    if (tokenVersion !== undefined && tokenVersion !== dbVersion) return false;
    return true;
}

/** Shared by createSessionToken (token `exp`) and getCookieOptions (cookie
 * `Max-Age`) so the two can never drift — see getCookieOptions for why that
 * mattered. */
export function getSessionExpirySecs(role: string): number {
    const operatorTerminalMode = process.env.MES_OPERATOR_TERMINAL_MODE === '1';
    return operatorTerminalMode && role === 'OPERATOR'
        ? OPERATOR_TERMINAL_SESSION_EXPIRY_SECS
        : DEFAULT_SESSION_EXPIRY_SECS;
}

export function createSessionToken(payload: Omit<SessionPayload, 'exp' | 'iat'>): string {
    const now = Math.floor(Date.now() / 1000);
    const expirySecs = getSessionExpirySecs(payload.role);
    const full: SessionPayload = { ...payload, iat: now, exp: now + expirySecs };
    const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
    const sig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
    try {
        const [encoded, sig] = token.split('.');
        if (!encoded || !sig) return null;
        const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) return null;
        const payload: SessionPayload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────

export const SESSION_COOKIE = 'mes_session';

/**
 * MEDIUM fix: this used to be a static object with a fixed maxAge
 * (DEFAULT_SESSION_EXPIRY_SECS). createSessionToken() issues an 8-hour
 * token for operators in terminal mode, but the cookie carrying it still
 * expired at the default 30 minutes — the browser dropped the cookie and
 * silently logged the operator out mid-shift even though the token itself
 * was still valid. Cookie Max-Age must match the token's real expiry, which
 * depends on role — so this is now a function, not a constant.
 */
export function getCookieOptions(role: string) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        // strict: cookies are not sent on cross-site requests, preventing CSRF
        sameSite: 'strict' as const,
        path: '/',
        maxAge: getSessionExpirySecs(role),
    };
}
