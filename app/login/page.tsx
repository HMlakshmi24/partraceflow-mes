'use client';

import { login } from '@/lib/actions/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Factory, Lock } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(formData: FormData) {
        setIsLoading(true);
        const res = await login(formData);

        if (res?.success) {
            if (res.role === 'ADMIN') router.push('/dashboard');
            else router.push('/operator');
        } else {
            setError(res?.message || 'Login failed');
            setIsLoading(false);
        }
    }

    return (
        <div style={{
            height: '100vh',
            backgroundColor: '#0f2a4a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'sans-serif'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '2.5rem',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '400px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <Factory size={48} color="#0f2a4a" style={{ marginBottom: '1rem' }} />
                    <h1 style={{ margin: 0, color: '#333', fontSize: '1.5rem' }}>ParTraceflow MES</h1>
                    <p style={{ color: '#666' }}>Sign in to access control system</p>
                </div>

                <form action={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Username</label>
                        <input name="username" placeholder="admin or op1" required
                            style={{ width: '100%', padding: '0.8rem', border: '1px solid #ddd', borderRadius: '4px' }} />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Password</label>
                        <input name="password" type="password" placeholder="••••••" required
                            style={{ width: '100%', padding: '0.8rem', border: '1px solid #ddd', borderRadius: '4px' }} />
                    </div>

                    {error && <div style={{ color: 'red', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

                    <button type="submit" disabled={isLoading} style={{
                        width: '100%',
                        padding: '1rem',
                        backgroundColor: '#2196f3',
                        color: 'white',
                        border: 'none',
                        fontWeight: 'bold',
                        borderRadius: '4px',
                        cursor: isLoading ? 'wait' : 'pointer',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <Lock size={18} /> {isLoading ? 'Authenticating...' : 'Secure Login'}
                    </button>
                </form>

                <div style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#999', textAlign: 'center' }}>
                    Restricted Access. Authorized Personnel Only.<br />
                    (Try: admin/admin)
                </div>
            </div>
        </div>
    );
}
