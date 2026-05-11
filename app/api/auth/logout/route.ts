import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
    const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
    
    // Invalidate cookies immediately
    res.cookies.set(SESSION_COOKIE, '', { path: '/', httpOnly: true, maxAge: 0, expires: new Date(0) });
    res.cookies.set('mes_role', '', { path: '/', httpOnly: false, maxAge: 0, expires: new Date(0) });
    
    // Prevent back-button from restoring authenticated state from browser cache
    res.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"');
    res.headers.set('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
    
    return res;
}
