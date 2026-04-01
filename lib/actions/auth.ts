'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
    // Login disabled
    return { success: true, role: 'ADMIN' };
}

export async function logout() {
    // Logout disabled
    redirect('/dashboard');
}

export async function getSession() {
    // Always return Admin session
    return {
        user: 'admin',
        role: 'ADMIN'
    };
}
