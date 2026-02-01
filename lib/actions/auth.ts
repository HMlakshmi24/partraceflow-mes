'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    // Verify against DB
    const { prisma } = await import('@/lib/services/database');
    const user = await prisma.user.findUnique({
        where: { username }
    });

    if (!user) {
        return { success: false, message: 'Invalid credentials' };
    }

    // For now, no password check as schema lacks password field.
    // In production, verify hash(password) === user.passwordHash
    const role = user.role;

    // Create Session
    const cookieStore = await cookies();
    cookieStore.set('mes_session', JSON.stringify({ user: username, role }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 // 1 day
    });

    return { success: true, role };
}

export async function logout() {
    const cookieStore = await cookies();
    cookieStore.delete('mes_session');
    redirect('/login');
}

export async function getSession() {
    const cookieStore = await cookies();
    const session = cookieStore.get('mes_session');
    if (!session) return null;
    try {
        return JSON.parse(session.value);
    } catch {
        return null;
    }
}
