/**
 * MFA — TOTP (RFC 6238) + backup codes.
 *
 * Hand-rolled with Node's built-in `crypto` only, consistent with this
 * app's existing auth.ts (no next-auth/passport, no third-party auth
 * dependency) — avoids adding a new dependency for a security-sensitive
 * primitive. Compatible with standard authenticator apps (Google
 * Authenticator, Authy, 1Password, etc.): HMAC-SHA1, 6 digits, 30s step,
 * the same defaults those apps assume.
 */

import crypto from 'crypto';
import { hashPassword, verifyPassword } from '@/lib/auth';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // accept 1 step early/late to absorb clock drift

// ─── Base32 (RFC 4648) — needed for the secret's authenticator-app format ───

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Exported for testing against RFC 4226/6238 known-answer test vectors
// without needing an authenticator app.
export function base32Encode(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

function base32Decode(str: string): Buffer {
    const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const char of clean) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

// ─── TOTP core (RFC 6238 / RFC 4226) ─────────────────────────────────────────

export function generateTotpSecret(): string {
    return base32Encode(crypto.randomBytes(20)); // 160-bit, standard TOTP secret length
}

function hotp(secretBuf: Buffer, counter: number): string {
    const counterBuf = Buffer.alloc(8);
    // Counter is a 64-bit big-endian integer; JS numbers are safe up to 2^53,
    // more than sufficient for a Unix-time-derived counter.
    counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
    counterBuf.writeUInt32BE(counter % 2 ** 32, 4);

    const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function generateTotp(base32Secret: string, at: number = Date.now()): string {
    const counter = Math.floor(at / 1000 / TOTP_STEP_SECONDS);
    return hotp(base32Decode(base32Secret), counter);
}

/** Verifies `token` against `base32Secret`, allowing ±TOTP_WINDOW steps of
 * clock drift. Uses a constant-time comparison per candidate. */
export function verifyTotp(base32Secret: string, token: string, at: number = Date.now()): boolean {
    const clean = token.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) return false;

    const secretBuf = base32Decode(base32Secret);
    const counter = Math.floor(at / 1000 / TOTP_STEP_SECONDS);

    for (let errorWindow = -TOTP_WINDOW; errorWindow <= TOTP_WINDOW; errorWindow++) {
        const candidate = hotp(secretBuf, counter + errorWindow);
        if (
            candidate.length === clean.length &&
            crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))
        ) {
            return true;
        }
    }
    return false;
}

export function generateOtpAuthUri(base32Secret: string, username: string, issuer = 'ParTraceflow MES'): string {
    const label = encodeURIComponent(`${issuer}:${username}`);
    const params = new URLSearchParams({
        secret: base32Secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(TOTP_DIGITS),
        period: String(TOTP_STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── Secret encryption at rest ───────────────────────────────────────────────
//
// Unlike passwords (hashed, never recovered), the server must be able to
// recover the raw TOTP secret to compute the current code — so it's
// encrypted (AES-256-GCM), not hashed, with a key derived from
// SESSION_SECRET via a distinct scrypt salt/info string (key separation:
// compromising this derived key doesn't directly hand over SESSION_SECRET
// or vice versa).

function getMfaEncryptionKey(): Buffer {
    const secret = process.env.SESSION_SECRET ?? 'mes-dev-secret-CHANGE-IN-PRODUCTION';
    return crypto.scryptSync(secret, 'mes-mfa-secret-key-v1', 32);
}

export function encryptMfaSecret(plainSecret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptMfaSecret(encrypted: string): string | null {
    try {
        const [ivHex, tagHex, ciphertextHex] = encrypted.split(':');
        if (!ivHex || !tagHex || !ciphertextHex) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', getMfaEncryptionKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
        return plaintext.toString('utf8');
    } catch {
        return null;
    }
}

// ─── Backup / recovery codes ──────────────────────────────────────────────────
//
// Low-entropy-by-design (8 chars) one-time codes, so they're hashed with the
// same deliberately-slow scrypt KDF as real passwords (lib/auth.ts) — not a
// fast hash — specifically to make offline brute-forcing them expensive.

const BACKUP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I ambiguity

function generateBackupCode(): string {
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)];
    }
    return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function generateBackupCodes(count = 10): string[] {
    return Array.from({ length: count }, generateBackupCode);
}

export function hashBackupCodes(codes: string[]): string {
    return JSON.stringify(codes.map(c => hashPassword(c.toUpperCase())));
}

/** Verifies `code` against the stored hash set. Returns the index consumed
 * (for removal) or -1 if invalid. Case/formatting-insensitive. */
export function verifyAndConsumeBackupCode(storedHashesJson: string, code: string): { valid: boolean; remainingHashes: string } {
    let hashes: string[];
    try {
        hashes = JSON.parse(storedHashesJson);
    } catch {
        return { valid: false, remainingHashes: storedHashesJson };
    }
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const idx = hashes.findIndex(h => verifyPassword(normalized, h));
    if (idx === -1) return { valid: false, remainingHashes: storedHashesJson };

    const remaining = [...hashes.slice(0, idx), ...hashes.slice(idx + 1)];
    return { valid: true, remainingHashes: JSON.stringify(remaining) };
}
