/**
 * Auth utilities — server-side only (Node.js runtime)
 *
 * Password hashing: crypto.scrypt  (NIST-recommended KDF)
 * Session tokens:   HMAC-SHA256 signed, base64url encoded
 *
 * Set SESSION_SECRET in .env for production.
 */

import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'mes-dev-secret-CHANGE-IN-PRODUCTION';
const SESSION_EXPIRY_SECS = 8 * 60 * 60; // 8 hours
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
    exp: number;
    iat: number;
}

export function createSessionToken(payload: Omit<SessionPayload, 'exp' | 'iat'>): string {
    const now = Math.floor(Date.now() / 1000);
    const full: SessionPayload = { ...payload, iat: now, exp: now + SESSION_EXPIRY_SECS };
    const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
    try {
        const [encoded, sig] = token.split('.');
        if (!encoded || !sig) return null;
        const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
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
export const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_EXPIRY_SECS,
};
