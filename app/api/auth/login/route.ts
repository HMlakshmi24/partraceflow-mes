import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { verifyPassword, createSessionToken, SESSION_COOKIE, COOKIE_OPTIONS } from '@/lib/auth';
import { LoginSchema, validationError } from '@/lib/validation';
import { authCheckFailureLimiter, authFailureLimiter } from '@/lib/rateLimit';
import { AuditService, EventType } from '@/lib/services/AuditService';

const WEAK_DEMO_PASSWORDS = new Set(['admin123', 'demo', 'password', '123456', 'admin', 'test']);

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

        // Warn when production accounts use known-weak passwords
        const usingWeakPassword = isProduction && WEAK_DEMO_PASSWORDS.has(password);
        if (usingWeakPassword) {
            AuditService.log(EventType.PERMISSION_DENIED, `User "${username}" attempted to login using weak credentials in production`, { username, ip }).catch(() => { });
            return NextResponse.json({ error: 'Weak default password detected in production. Contact administrator to reset your password.' }, { status: 403 });
        }

        // Enforce mustChangePassword
        if (user.mustChangePassword) {
            const token = createSessionToken({ userId: user.id, username: user.username, role: user.role });
            const res = NextResponse.json({
                success: true,
                mustChangePassword: true,
                user: { id: user.id, username: user.username, role: user.role },
            });
            res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
            return res;
        }

        AuditService.log(EventType.AUTH_LOGIN, `User "${username}" logged in`, { username, role: user.role, ip }, user.id).catch(() => { });

        const token = createSessionToken({ userId: user.id, username: user.username, role: user.role });
        const res = NextResponse.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role },
        });

        res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
        return res;

    } catch {
        // DB unavailable — fall back to built-in demo credentials so the app remains usable
        if (isProduction) {
            console.error('[MES] Database unavailable during login — refusing demo fallback in production.');
            return NextResponse.json({ error: 'Authentication service unavailable. Contact your administrator.' }, { status: 503 });
        }

        const DEMO_USERS: Record<string, { id: string; role: string; password: string }> = {
            'admin': { id: 'demo-admin-001', role: 'ADMIN', password: process.env.DEMO_ADMIN_PASSWORD ?? 'admin123' },
            'Ramesh.Kumar': { id: 'demo-op-001', role: 'OPERATOR', password: process.env.DEMO_OPERATOR_PASSWORD ?? 'demo' },
            'Priya.Nair': { id: 'demo-op-002', role: 'OPERATOR', password: process.env.DEMO_OPERATOR_PASSWORD ?? 'demo' },
            'Ravi.Shankar': { id: 'demo-op-003', role: 'OPERATOR', password: process.env.DEMO_OPERATOR_PASSWORD ?? 'demo' },
            'Deepa.QC': { id: 'demo-qc-001', role: 'QUALITY', password: process.env.DEMO_OPERATOR_PASSWORD ?? 'demo' },
            'Arjun.Supv': { id: 'demo-sup-001', role: 'SUPERVISOR', password: process.env.DEMO_OPERATOR_PASSWORD ?? 'demo' },
            'Meena.Planner': { id: 'demo-plan-001', role: 'PLANNER', password: process.env.DEMO_OPERATOR_PASSWORD ?? 'demo' },
            'operator': { id: 'demo-op-004', role: 'OPERATOR', password: process.env.DEMO_OPERATOR_PASSWORD ?? 'demo' },
        };

        const demo = DEMO_USERS[username];
        if (!demo || demo.password !== password) {
            await authFailureLimiter(ip, username);
            await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        const token = createSessionToken({ userId: demo.id, username, role: demo.role });
        const res = NextResponse.json({
            success: true,
            user: { id: demo.id, username, role: demo.role },
            warning: 'Running in demo mode — database is offline. All data is temporary.',
        });
        res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
        return res;
    }
}
