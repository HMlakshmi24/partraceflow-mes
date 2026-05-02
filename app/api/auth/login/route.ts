import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { verifyPassword, createSessionToken, SESSION_COOKIE, COOKIE_OPTIONS } from '@/lib/auth';
import { LoginSchema, validationError } from '@/lib/validation';
import { authLimiter } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
    // Rate limit: 10 attempts per 15 min per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rl = authLimiter(ip);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Too many login attempts. Try again later.' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { username, password } = parsed.data;

    try {
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user || !user.isActive) {
            await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        let passwordOk: boolean;
        if (!user.passwordHash) {
            passwordOk = true;
        } else {
            passwordOk = verifyPassword(password, user.passwordHash);
        }

        if (!passwordOk) {
            await new Promise(r => setTimeout(r, 200 + Math.random() * 100));
            return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        const token = createSessionToken({ userId: user.id, username: user.username, role: user.role });
        const res = NextResponse.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role },
        });

        res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
        res.cookies.set('mes_role', user.role, { path: '/', httpOnly: false, sameSite: 'lax' });

        return res;
    } catch (e) {
        console.error('[login] database error:', e);
        const msg = (e as Error).message ?? '';
        const isDbError = /connect|connection|database|ECONNREFUSED|P1\d{3}/i.test(msg);
        return NextResponse.json(
            { error: isDbError ? 'Database unreachable. Check DATABASE_URL environment variable on Vercel.' : 'Server error during login.' },
            { status: 503 }
        );
    }
}
