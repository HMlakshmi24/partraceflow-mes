/**
 * Edge-compatible token verification (Web Crypto API)
 * Used by proxy.ts (formerly middleware.ts) which runs in the Edge Runtime.
 */

export const SESSION_COOKIE = 'mes_session';

function b64urlToBytes(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

export async function verifyEdgeToken(
    token: string
): Promise<{
    userId: string;
    username: string;
    role: string;
    mustChangePassword?: boolean;
    sessionVersion?: number;
    mfaEnabled?: boolean;
    mfaVerified?: boolean;
} | null> {
    try {
        const secret = process.env.SESSION_SECRET ?? 'mes-dev-secret-CHANGE-IN-PRODUCTION';
        // H5: Reject all sessions in production if SESSION_SECRET is the insecure default
        if (process.env.NODE_ENV === 'production' && secret === 'mes-dev-secret-CHANGE-IN-PRODUCTION') {
            throw new Error('[MES] SESSION_SECRET is not configured — set it in Vercel environment variables.');
        }
        const [encoded, sig] = token.split('.');
        if (!encoded || !sig) return null;

        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const sigBytes = b64urlToBytes(sig);
        // Ensure we have a plain ArrayBuffer (not SharedArrayBuffer) for Web Crypto
        const sigBuf = sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer;
        const valid = await crypto.subtle.verify(
            'HMAC', key,
            sigBuf,
            new TextEncoder().encode(encoded)
        );
        if (!valid) return null;

        const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(encoded)));
        if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

        return {
            userId: payload.userId,
            username: payload.username,
            role: payload.role,
            mustChangePassword: payload.mustChangePassword,
            sessionVersion: payload.sessionVersion,
            mfaEnabled: payload.mfaEnabled,
            mfaVerified: payload.mfaVerified,
        };
    } catch {
        return null;
    }
}
