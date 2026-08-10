import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/services/database';
import { hashPassword, createSessionToken, SESSION_COOKIE, getCookieOptions } from '@/lib/auth';
import { getBackupMode } from '@/lib/services/BackupService';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/getClientIp';
import { AuditService, EventType } from '@/lib/services/AuditService';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/demo-login');

/**
 * POST /api/auth/demo-login
 *
 * Powers the /login page's one-click role quick-sign-in. Fixes a real
 * vulnerability found during manual browser testing of this session's
 * changes: the login page previously shipped hardcoded, *working*
 * credentials (including a real ADMIN password) directly in the public JS
 * bundle — anyone loading /login could become ADMIN with one click, no
 * password needed, in every build including production.
 *
 * This replaces that with a server-authoritative design: the client sends
 * only a role, never a password. The server:
 *   1. Refuses entirely unless getBackupMode() === 'demo' (the same
 *      demo/production distinction BackupService and /api/health enforce —
 *      true only when NODE_ENV isn't production, or MES_BACKUP_MODE=demo is
 *      explicitly set for a staging/demo deployment). In a real production
 *      deployment this endpoint always 403s regardless of what's sent, and
 *      the login page doesn't render the buttons at all (see app/login).
 *   2. Finds-or-creates a well-known demo user for that role with a
 *      random, never-exposed password hash — login here is authenticated
 *      by the demo-mode gate + role lookup, not a password, so there is no
 *      credential to leak in the first place.
 *   3. Rate-limits and audit-logs every use, clearly labeled as a demo
 *      login so it's distinguishable from a real credentialed sign-in.
 */

const DEMO_ROLE_USERS: Record<string, { username: string; displayName: string }> = {
    ADMIN: { username: 'admin', displayName: 'Demo Administrator' },
    SUPERVISOR: { username: 'Arjun.Supv', displayName: 'Arjun (Supervisor)' },
    OPERATOR: { username: 'operator', displayName: 'Default Operator' },
    QUALITY: { username: 'Deepa.QC', displayName: 'Deepa (Quality Inspector)' },
};

export async function POST(req: NextRequest) {
    if (getBackupMode() !== 'demo') {
        return NextResponse.json({ error: 'Demo sign-in is not available on this deployment.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const role = typeof body?.role === 'string' ? body.role : '';
    const demoUser = DEMO_ROLE_USERS[role];
    if (!demoUser) {
        return NextResponse.json({ error: 'Unknown demo role' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const rl = await rateLimit(`demo-login:${ip}`, { limit: 20, windowMs: 5 * 60 * 1000 });
    if (!rl.allowed) {
        return NextResponse.json({ error: 'Too many demo sign-in attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } });
    }

    try {
        let user = await prisma.user.findUnique({
            where: { username: demoUser.username },
            select: { id: true, username: true, role: true, isActive: true, mustChangePassword: true, sessionVersion: true },
        });

        if (!user) {
            // Demo-only: password is random and never returned — this account
            // can only be reached through this demo-gated endpoint, not the
            // real password-based login.
            user = await prisma.user.create({
                data: {
                    username: demoUser.username,
                    displayName: demoUser.displayName,
                    role,
                    isActive: true,
                    mustChangePassword: false,
                    passwordHash: hashPassword(crypto.randomBytes(32).toString('hex')),
                },
                select: { id: true, username: true, role: true, isActive: true, mustChangePassword: true, sessionVersion: true },
            });
        } else if (!user.isActive) {
            return NextResponse.json({ error: 'Demo account is disabled' }, { status: 403 });
        }

        // Bug found via load testing: two of these demo accounts
        // (Arjun.Supv, Deepa.QC) pre-date this endpoint and were left with
        // mustChangePassword=true from whenever they were originally
        // provisioned (e.g. via /api/users/repair). Demo-login has no
        // password prompt and the account's real password is a random
        // value that was never exposed to anyone — so once mustChangePassword
        // is true, proxy.ts's gate gets satisfied by nothing the user can
        // do, and every request after a successful demo login 403s with
        // "Password change required". Demo accounts must never carry this
        // flag; clear it (in the DB, not just the token) so the Users page
        // also stops showing a stale "must change password" badge for them.
        if (user.mustChangePassword) {
            await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
            user.mustChangePassword = false;
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        AuditService.log(
            EventType.AUTH_LOGIN,
            `Demo sign-in as "${user.username}" (${user.role})`,
            { username: user.username, role: user.role, ip, demo: true },
            user.id,
        ).catch(() => {});

        // MFA is intentionally bypassed for demo sign-in: it's already gated
        // end-to-end by getBackupMode() === 'demo' above (never reachable in
        // production regardless of what's sent), and forcing MFA enrollment
        // through a one-click demo button would defeat the point of it
        // without adding real security — this path can never be live in a
        // real deployment. mfaEnabled/mfaVerified are both forced true so
        // proxy.ts never routes a demo session through the MFA gate.
        const token = createSessionToken({
            userId: user.id,
            username: user.username,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
            sessionVersion: user.sessionVersion,
            mfaEnabled: true,
            mfaVerified: true,
        });

        const res = NextResponse.json({
            success: true,
            mustChangePassword: user.mustChangePassword,
            user: { id: user.id, username: user.username, role: user.role },
        });
        res.cookies.set(SESSION_COOKIE, token, getCookieOptions(user.role));
        return res;
    } catch (error) {
        log.error('demo login failed', { message: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'Demo sign-in unavailable. Please try again later.' }, { status: 503 });
    }
}
