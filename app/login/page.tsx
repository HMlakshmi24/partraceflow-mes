'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Factory, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';

const DEMO_ACCOUNTS = [
    { username: 'admin',    role: 'Administrator',  color: '#6366f1' },
    { username: 'SUPV-LEE', role: 'Supervisor',     color: '#0ea5e9' },
    { username: 'OP-JOHN',  role: 'Operator',       color: '#10b981' },
    { username: 'QC-SARAH', role: 'Quality Insp.',  color: '#f59e0b' },
];

function LoginContent() {
    const router = useRouter();
    const params = useSearchParams();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const denied = params.get('denied') === '1';
    const expired = params.get('expired') === '1';

    useEffect(() => {
        if (denied) setError('Access denied — you do not have permission for that page.');
        if (expired) setError('Your session has expired. Please log in again.');
    }, [denied, expired]);

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        if (!username.trim()) { setError('Username is required'); return; }
        if (!password) { setError('Password is required'); return; }

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                // Redirect to originally requested page or dashboard
                const next = params.get('next') ?? '/dashboard';
                router.replace(next);
            } else {
                setError(data.error ?? 'Login failed. Please try again.');
            }
        } catch {
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    }

    function quickLogin(u: string) {
        setUsername(u);
        setPassword('demo');
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0b1220 0%, #12213b 50%, #0b1220 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
            <div style={{ width: '100%', maxWidth: 420 }}>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', color: '#fff', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        <Factory size={36} color="#67e8f9" />
                        ParTraceflow MES
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                        Manufacturing Execution System
                    </div>
                </div>

                {/* Card */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '1.25rem',
                    padding: '2rem',
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
                }}>
                    <h2 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.25rem' }}>Sign in</h2>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
                        Enter your credentials to access the factory floor
                    </p>

                    {error && (
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.75rem 1rem', borderRadius: '0.6rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                                Username
                            </label>
                            <div style={{ position: 'relative' }}>
                                <User size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    autoComplete="username"
                                    placeholder="e.g. admin"
                                    style={{
                                        width: '100%',
                                        padding: '0.7rem 0.75rem 0.7rem 2.4rem',
                                        borderRadius: '0.6rem',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        background: 'rgba(255,255,255,0.07)',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                        boxSizing: 'border-box',
                                        outline: 'none',
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    placeholder="Password"
                                    style={{
                                        width: '100%',
                                        padding: '0.7rem 2.4rem 0.7rem 2.4rem',
                                        borderRadius: '0.6rem',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        background: 'rgba(255,255,255,0.07)',
                                        color: '#fff',
                                        fontSize: '0.95rem',
                                        boxSizing: 'border-box',
                                        outline: 'none',
                                    }}
                                />
                                <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex' }}>
                                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '0.8rem',
                                borderRadius: '0.6rem',
                                border: 'none',
                                background: loading ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                marginTop: '0.25rem',
                                transition: 'opacity 0.2s',
                                boxShadow: loading ? 'none' : '0 4px 15px rgba(99,102,241,0.35)',
                            }}
                        >
                            {loading ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>

                    {/* Demo quick-login */}
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                            Demo accounts (password: demo)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            {DEMO_ACCOUNTS.map(acc => (
                                <button
                                    key={acc.username}
                                    type="button"
                                    onClick={() => quickLogin(acc.username)}
                                    style={{
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '0.5rem',
                                        border: `1px solid ${acc.color}40`,
                                        background: `${acc.color}15`,
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                    }}
                                >
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: acc.color }}>{acc.username}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>{acc.role}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)' }}>
                    ParTraceflow MES · Factory-01 · {new Date().getFullYear()}
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginContent />
        </Suspense>
    );
}
