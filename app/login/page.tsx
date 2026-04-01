'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Factory, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

// Quick-login cards for demo — click fills AND submits
const DEMO_ACCOUNTS = [
    { username: 'admin',      password: 'Admin@1234',    role: 'Administrator',   color: '#6366f1', emoji: '👑' },
    { username: 'supervisor', password: 'Super@1234',    role: 'Supervisor',      color: '#0ea5e9', emoji: '🏭' },
    { username: 'operator',   password: 'Operator@1234', role: 'Operator',        color: '#10b981', emoji: '🔧' },
    { username: 'quality',    password: 'Quality@1234',  role: 'Quality Manager', color: '#f59e0b', emoji: '✅' },
];

function LoginContent() {
    const router = useRouter();
    const params = useSearchParams();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const denied  = params.get('denied')  === '1';
    const expired = params.get('expired') === '1';

    useEffect(() => {
        if (denied)  setError('You do not have permission to view that page. Please log in with the correct account.');
        if (expired) setError('Your session has expired. Please sign in again.');
    }, [denied, expired]);

    async function doLogin(u: string, p: string) {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u.trim(), password: p }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                router.replace(params.get('next') ?? '/dashboard');
            } else {
                setError(data.error ?? 'Incorrect username or password. Please try again.');
            }
        } catch {
            setError('Cannot reach the server. Please check your internet connection.');
        } finally {
            setLoading(false);
        }
    }

    function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        if (!username.trim()) { setError('Please enter your username.'); return; }
        if (!password)         { setError('Please enter your password.'); return; }
        doLogin(username, password);
    }

    function quickLogin(u: string, p: string) {
        setUsername(u);
        setPassword(p);
        doLogin(u, p);
    }

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.8rem 0.85rem 0.8rem 2.6rem',
        borderRadius: '0.7rem',
        border: '1.5px solid rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.07)',
        color: '#fff',
        fontSize: '1rem',
        boxSizing: 'border-box',
        outline: 'none',
        transition: 'border-color 0.2s',
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0b1220 0%, #0f1e38 50%, #0b1220 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
            <div style={{ width: '100%', maxWidth: 440 }}>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 64, height: 64, borderRadius: '1rem',
                        background: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)',
                        marginBottom: '1rem',
                        boxShadow: '0 8px 24px rgba(14,165,233,0.35)',
                    }}>
                        <Factory size={32} color="#fff" />
                    </div>
                    <div style={{ color: '#fff', fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        ParTraceflow MES
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginTop: '0.3rem' }}>
                        Manufacturing Management System
                    </div>
                </div>

                {/* Card */}
                <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '1.5rem',
                    padding: '2rem',
                    backdropFilter: 'blur(16px)',
                    boxShadow: '0 30px 70px rgba(0,0,0,0.5)',
                }}>
                    <h2 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.35rem' }}>
                        Welcome back
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>
                        Sign in to access the factory floor
                    </p>

                    {error && (
                        <div style={{
                            display: 'flex', gap: '0.7rem', alignItems: 'flex-start',
                            padding: '0.85rem 1rem', borderRadius: '0.75rem',
                            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                            color: '#fca5a5', fontSize: '0.88rem', marginBottom: '1.5rem',
                            lineHeight: 1.5,
                        }}>
                            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                        {/* Username */}
                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.75)', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Username
                            </label>
                            <div style={{ position: 'relative' }}>
                                <User size={17} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    autoComplete="username"
                                    placeholder="Enter your username"
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.75)', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={17} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                    style={{ ...inputStyle, paddingRight: '2.8rem' }}
                                />
                                <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                                    position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex',
                                }}>
                                    {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '0.9rem',
                                borderRadius: '0.75rem',
                                border: 'none',
                                background: loading ? 'rgba(14,165,233,0.4)' : 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '1rem',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                marginTop: '0.25rem',
                                boxShadow: loading ? 'none' : '0 4px 18px rgba(14,165,233,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                transition: 'opacity 0.2s',
                            }}
                        >
                            {loading ? (
                                <>
                                    <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={17} />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>

                    {/* Quick login section */}
                    <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.85rem', textAlign: 'center' }}>
                            Quick Login — Demo Accounts
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            {DEMO_ACCOUNTS.map(acc => (
                                <button
                                    key={acc.username}
                                    type="button"
                                    disabled={loading}
                                    onClick={() => quickLogin(acc.username, acc.password)}
                                    style={{
                                        padding: '0.65rem 0.85rem',
                                        borderRadius: '0.65rem',
                                        border: `1.5px solid ${acc.color}35`,
                                        background: `${acc.color}12`,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        textAlign: 'left',
                                        transition: 'background 0.15s, border-color 0.15s',
                                    }}
                                >
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: acc.color, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span>{acc.emoji}</span>
                                        {acc.username}
                                    </div>
                                    <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.15rem' }}>
                                        {acc.role}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.73rem', textAlign: 'center', marginTop: '0.75rem', margin: '0.75rem 0 0' }}>
                            Click any card above to log in instantly
                        </p>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)' }}>
                    ParTraceflow MES &nbsp;·&nbsp; Factory-01 &nbsp;·&nbsp; {new Date().getFullYear()}
                </div>

                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
