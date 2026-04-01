import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, '', { path: '/', httpOnly: true, maxAge: 0 });
    res.cookies.set('mes_role', '', { path: '/', httpOnly: false, maxAge: 0 });
    return res;
}
