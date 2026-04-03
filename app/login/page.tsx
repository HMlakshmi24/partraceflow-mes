'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Factory, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle, Crown, HardHat, Wrench } from 'lucide-react';

// Quick-login cards for demo — click fills AND submits
const DEMO_ACCOUNTS = [
    {
        username: 'admin',
        password: 'admin123',
        role: 'Administrator',
        description: 'Full system access',
        color: '#6366f1',
        borderColor: 'rgba(99,102,241,0.5)',
        bg: 'rgba(99,102,241,0.12)',
        Icon: Crown,
    },
    {
        username: 'SUPV-LEE',
        password: 'demo',
        role: 'Supervisor',
        description: 'Manage production floor',
        color: '#0ea5e9',
        borderColor: 'rgba(14,165,233,0.5)',
        bg: 'rgba(14,165,233,0.12)',
        Icon: HardHat,
    },
    {
        username: 'OP-JOHN',
        password: 'demo',
        role: 'Operator / Worker',
        description: 'Log your work and tasks',
        color: '#10b981',
        borderColor: 'rgba(16,185,129,0.5)',
        bg: 'rgba(16,185,129,0.12)',
        Icon: Wrench,
    },
    {
        username: 'QC-SARAH',
        password: 'demo',
        role: 'Quality Inspector',
        description: 'Inspect and approve work',
        color: '#f59e0b',
        borderColor: 'rgba(245,158,11,0.5)',
        bg: 'rgba(245,158,11,0.12)',
        Icon: CheckCircle,
    },
];

function LoginContent() {
    const router = useRouter();
    const params = useSearchParams();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingCard, setLoadingCard] = useState<string | null>(null);
    const [error, setError] = useState('');
    const denied = params.get('denied') === '1';
    const expired = params.get('expired') === '1';

    useEffect(() => {
        if (denied) setError('You do not have permission to view that page. Please log in with the correct account.');
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
                setLoadingCard(null);
            }
        } catch {
            setError('Cannot reach the server. Please check your internet connection.');
            setLoadingCard(null);
        } finally {
            setLoading(false);
        }
    }

    function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        if (!username.trim()) { setError('Please enter your username.'); return; }
        if (!password) { setError('Please enter your password.'); return; }
        doLogin(username, password);
    }

    function quickLogin(u: string, p: string) {
        setLoadingCard(u);
        setUsername(u);
        setPassword(p);
        doLogin(u, p);
    }

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.85rem 0.9rem 0.85rem 2.8rem',
        borderRadius: '0.75rem',
        border: '1.5px solid rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.07)',
        color: '#fff',
        fontSize: '1rem',
        boxSizing: 'border-box',
        outline: 'none',
        transition: 'border-color 0.2s',
        minHeight: '48px',
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0b1220 0%, #0f1a2e 50%, #1b2f52 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>

            {/* Top: Logo + Title */}
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 80, height: 80, borderRadius: '1.25rem',
                    background: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)',
                    marginBottom: '1.25rem',
                    boxShadow: '0 12px 32px rgba(14,165,233,0.4)',
                }}>
                    <Factory size={40} color="#fff" />
                </div>
                <div style={{ color: '#fff', fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    ParTraceflow MES
                </div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1rem', marginTop: '0.5rem', fontWeight: 500 }}>
                    Manufacturing Management System
                </div>
            </div>

            {/* Role Selection Section */}
            <div style={{ width: '100%', maxWidth: 720 }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
                        Select your role to sign in instantly
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', margin: '0.45rem 0 0' }}>
                        Demo buttons use the seeded factory accounts directly.
                    </p>
                </div>

                {/* Role Cards Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem',
                }}>
                    {DEMO_ACCOUNTS.map(acc => {
                        const isThisLoading = loadingCard === acc.username;
                        const { Icon } = acc;
                        return (
                            <button
                                key={acc.username}
                                type="button"
                                disabled={loading}
                                onClick={() => quickLogin(acc.username, acc.password)}
                                style={{
                                    position: 'relative',
                                    minHeight: '140px',
                                    padding: '20px 16px',
                                    borderRadius: '1rem',
                                    border: `2px solid ${acc.borderColor}`,
                                    background: acc.bg,
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    textAlign: 'center',
                                    transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
                                    backdropFilter: 'blur(8px)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    overflow: 'hidden',
                                }}
                                onMouseEnter={e => {
                                    if (!loading) {
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                                        (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px ${acc.color}30`;
                                        (e.currentTarget as HTMLElement).style.borderColor = acc.color;
                                    }
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                                    (e.currentTarget as HTMLElement).style.borderColor = acc.borderColor;
                                }}
                            >
                                {/* Loading overlay */}
                                {isThisLoading && (
                                    <div style={{
                                        position: 'absolute', inset: 0, borderRadius: '0.85rem',
                                        background: 'rgba(0,0,0,0.4)', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', zIndex: 1,
                                    }}>
                                        <span style={{
                                            width: 24, height: 24,
                                            border: '3px solid rgba(255,255,255,0.3)',
                                            borderTopColor: '#fff',
                                            borderRadius: '50%',
                                            display: 'inline-block',
                                            animation: 'spin 0.7s linear infinite',
                                        }} />
                                    </div>
                                )}

                                {/* Icon */}
                                <div style={{
                                    width: 52, height: 52, borderRadius: '0.8rem',
                                    background: acc.color + '22',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 2,
                                }}>
                                    <Icon size={26} color={acc.color} />
                                </div>

                                {/* Role name */}
                                <div style={{ color: '#fff', fontSize: '15px', fontWeight: 700, lineHeight: 1.2 }}>
                                    {acc.role}
                                </div>

                                {/* Description */}
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', lineHeight: 1.3 }}>
                                    {acc.description}
                                </div>

                                {/* Click hint */}
                                <div style={{ color: acc.color, fontSize: '11px', fontWeight: 700, marginTop: 2, opacity: 0.9 }}>
                                    Click to Sign In
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.75rem' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        — or enter your credentials manually —
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
                </div>

                {/* Manual Login Form */}
                <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '1.25rem',
                    padding: '2rem',
                    backdropFilter: 'blur(16px)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
                }}>

                    {/* Error */}
                    {error && (
                        <div style={{
                            display: 'flex', gap: '0.7rem', alignItems: 'flex-start',
                            padding: '0.9rem 1rem', borderRadius: '0.75rem',
                            background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)',
                            color: '#fca5a5', fontSize: '0.9rem', marginBottom: '1.5rem',
                            lineHeight: 1.5,
                        }}>
                            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                        {/* Username */}
                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                                Username
                            </label>
                            <div style={{ position: 'relative' }}>
                                <User size={18} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
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
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                    style={{ ...inputStyle, paddingRight: '3rem' }}
                                />
                                <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                                    position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex',
                                }}>
                                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                minHeight: '52px',
                                padding: '0.9rem',
                                borderRadius: '0.85rem',
                                border: 'none',
                                background: loading ? 'rgba(14,165,233,0.4)' : 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                                color: '#fff',
                                fontWeight: 800,
                                fontSize: '1.05rem',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                marginTop: '0.25rem',
                                boxShadow: loading ? 'none' : '0 4px 18px rgba(14,165,233,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                transition: 'opacity 0.2s',
                            }}
                        >
                            {loading && loadingCard === null ? (
                                <>
                                    <span style={{ display: 'inline-block', width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={18} />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)' }}>
                ParTraceflow MES &nbsp;·&nbsp; Factory-01 &nbsp;·&nbsp; {new Date().getFullYear()}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
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
