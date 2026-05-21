import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { verifyPassword, createSessionToken, SESSION_COOKIE, COOKIE_OPTIONS } from '@/lib/auth';
import { LoginSchema, validationError } from '@/lib/validation';
import { authCheckFailureLimiter, authFailureLimiter } from '@/lib/rateLimit';
import { AuditService, EventType } from '@/lib/services/AuditService';

const WEAK_DEMO_PASSWORDS = new Set(['admin123', 'demo', 'password', '123456', 'admin', 'test']);

function resolveDbFallbackUser(username: string, password: string) {
    // Emergency access path for local/dev demos when database connectivity is temporarily unavailable.
    // Disabled by default in production unless explicitly enabled.
    const dbFallbackEnabled =
        process.env.NODE_ENV !== 'production' || process.env.ALLOW_DBLESS_DEMO_LOGIN === 'true';
    if (!dbFallbackEnabled) return null;

    const adminUser = (process.env.DEMO_ADMIN_USERNAME ?? 'admin').trim();
    const adminPass = process.env.DEMO_ADMIN_PASSWORD ?? 'admin123';
    const operatorUser = (process.env.DEMO_OPERATOR_USERNAME ?? 'operator').trim();
    const operatorPass = process.env.DEMO_OPERATOR_PASSWORD ?? 'demo';

    if (username === adminUser && password === adminPass) {
        return { id: 'demo-admin-local', username: adminUser, role: 'ADMIN' as const };
    }

    if (username === operatorUser && password === operatorPass) {
        return { id: 'demo-operator-local', username: operatorUser, role: 'OPERATOR' as const };
    }

    return null;
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { username, password } = parsed.data;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown';

    const rl = await authCheckFailureLimiter(ip, username);
    if (!rl.allowed) {
        AuditService.log(EventType.AUTH_RATE_LIMITED, `Rate limit exceeded for "${username}"`, { username, ip }).catch(() => { });
        return NextResponse.json(
            { error: 'Too many failed login attempts. Try again later.' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
    }

    const isProduction = process.env.NODE_ENV === 'production';

    try {
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user || !user.isActive) {
            await authFailureLimiter(ip, username);
            await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
            AuditService.log(EventType.AUTH_FAILED, `Login failed for "${username}" — user not found or inactive`, { username, ip }).catch(() => { });
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        const passwordOk = !user.passwordHash ? true : verifyPassword(password, user.passwordHash);

        if (!passwordOk) {
            await authFailureLimiter(ip, username);
            await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
            AuditService.log(EventType.AUTH_FAILED, `Login failed for "${username}" — wrong password`, { username, ip }, user.id).catch(() => { });
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        // Audit-log when production accounts use known-weak passwords, but do not block
        if (isProduction && WEAK_DEMO_PASSWORDS.has(password)) {
            AuditService.log(EventType.PERMISSION_DENIED, `Security notice: User "${username}" is using a weak default password in production`, { username, ip }).catch(() => { });
        }

        // Enforce mustChangePassword
        if (user.mustChangePassword) {
            const token = createSessionToken({ userId: user.id, username: user.username, role: user.role, mustChangePassword: true });
            const res = NextResponse.json({
                success: true,
                mustChangePassword: true,
                user: { id: user.id, username: user.username, role: user.role },
            });
            res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
            return res;
        }

        AuditService.log(EventType.AUTH_LOGIN, `User "${username}" logged in`, { username, role: user.role, ip }, user.id).catch(() => { });

        const token = createSessionToken({ userId: user.id, username: user.username, role: user.role, mustChangePassword: false });
        const res = NextResponse.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role },
        });

        res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
        return res;

    } catch (error) {
        console.error('[MES] Database unavailable during login:', (error as Error).message);

        const fallbackUser = resolveDbFallbackUser(username, password);
        if (fallbackUser) {
            const token = createSessionToken({
                userId: fallbackUser.id,
                username: fallbackUser.username,
                role: fallbackUser.role,
                mustChangePassword: false,
            });

            const res = NextResponse.json({
                success: true,
                degradedAuth: true,
                user: { id: fallbackUser.id, username: fallbackUser.username, role: fallbackUser.role },
                warning: 'Signed in using emergency demo mode because the database is currently unreachable.',
            });
            res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
            return res;
        }

        return NextResponse.json({ error: 'Authentication service unavailable. Please check database connection.' }, { status: 503 });
    }
}
