'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, AlertCircle, Factory, KeyRound, LogOut } from 'lucide-react';

function MfaVerifyContent() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get('next') ?? '/dashboard';

    const [useBackupCode, setUseBackupCode] = useState(false);
    const [code, setCode] = useState('');
    const [backupCode, setBackupCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lowCodeWarning, setLowCodeWarning] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = useBackupCode
                ? await fetch('/api/auth/mfa/backup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: backupCode }),
                    credentials: 'include',
                })
                : await fetch('/api/auth/mfa/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: code }),
                    credentials: 'include',
                });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'Verification failed. Please try again.'); return; }
            if (useBackupCode && data.lowCodeWarning) {
                setLowCodeWarning(true);
                return;
            }
            router.replace(next);
        } catch {
            setError('Network error — cannot reach the server.');
        } finally {
            setLoading(false);
        }
    }

    async function handleLogout() {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        router.push('/login');
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.85rem 0.9rem', borderRadius: '0.75rem',
        border: '1.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)',
        color: '#fff', boxSizing: 'border-box', outline: 'none',
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0b1220 0%, #0f1a2e 50%, #1b2f52 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '2rem 1rem', fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 72, height: 72, borderRadius: '1.25rem',
                    background: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)',
                    marginBottom: '1rem', boxShadow: '0 12px 32px rgba(14,165,233,0.4)',
                }}>
                    <Factory size={36} color="#fff" />
                </div>
                <div style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    Verify It&apos;s You
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.92rem', marginTop: '0.4rem' }}>
                    Enter the code from your authenticator app
                </div>
            </div>

            <div style={{
                width: '100%', maxWidth: 420,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '1.25rem', padding: '2rem',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
            }}>
                {error && (
                    <div style={{
                        display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                        padding: '0.85rem 1rem', borderRadius: '0.75rem', marginBottom: '1.1rem',
                        background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)',
                        color: '#fca5a5', fontSize: '0.9rem', lineHeight: 1.5,
                    }}>
                        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>{error}</div>
                    </div>
                )}

                {lowCodeWarning ? (
                    <div>
                        <div style={{
                            display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                            padding: '0.85rem 1rem', borderRadius: '0.75rem', marginBottom: '1.1rem',
                            background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.35)',
                            color: '#fcd34d', fontSize: '0.88rem', lineHeight: 1.5,
                        }}>
                            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>You&apos;re running low on backup codes. Regenerate a fresh set from Settings once you&apos;re signed in.</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => router.replace(next)}
                            style={{
                                width: '100%', minHeight: '50px', padding: '0.9rem', borderRadius: '0.85rem', border: 'none',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
                            }}
                        >
                            Continue
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {useBackupCode ? (
                            <div>
                                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                                    Backup code
                                </label>
                                <input
                                    type="text"
                                    value={backupCode}
                                    onChange={e => setBackupCode(e.target.value)}
                                    placeholder="XXXX-XXXX"
                                    style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '1.1rem', textAlign: 'center', letterSpacing: '0.1em' }}
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <div>
                                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                                    6-digit code
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    style={{ ...inputStyle, fontSize: '1.4rem', letterSpacing: '0.4em', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                                    autoFocus
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (useBackupCode ? backupCode.trim().length === 0 : code.length !== 6)}
                            style={{
                                minHeight: '50px', padding: '0.9rem', borderRadius: '0.85rem', border: 'none',
                                background: (loading || (useBackupCode ? backupCode.trim().length === 0 : code.length !== 6))
                                    ? 'rgba(14,165,233,0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff', fontWeight: 800, fontSize: '1rem',
                                cursor: (loading || (useBackupCode ? backupCode.trim().length === 0 : code.length !== 6)) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            }}
                        >
                            {loading ? 'Verifying…' : <><ShieldCheck size={18} /> Verify</>}
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                            <button
                                type="button"
                                onClick={() => { setUseBackupCode(v => !v); setError(''); }}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: 0 }}
                            >
                                <KeyRound size={13} /> {useBackupCode ? 'Use authenticator code instead' : 'Use a backup code instead'}
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: 0 }}
                            >
                                <LogOut size={13} /> Sign out
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default function MfaVerifyPage() {
    return (
        <Suspense>
            <MfaVerifyContent />
        </Suspense>
    );
}
