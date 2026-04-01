/**
 * Edge-compatible token verification (Web Crypto API)
 * Used by middleware.ts which runs in the Edge Runtime.
 */

export const SESSION_COOKIE = 'mes_session';

function b64urlToBytes(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

export async function verifyEdgeToken(
    token: string
): Promise<{ userId: string; username: string; role: string } | null> {
    try {
        const secret = process.env.SESSION_SECRET ?? 'mes-dev-secret-CHANGE-IN-PRODUCTION';
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

        return { userId: payload.userId, username: payload.username, role: payload.role };
    } catch {
        return null;
    }
}
