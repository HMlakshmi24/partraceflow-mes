'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, CheckCircle, AlertCircle, Eye, EyeOff, Factory } from 'lucide-react';

const RULES = [
    { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
    { label: 'One uppercase letter (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter (a-z)', test: (p: string) => /[a-z]/.test(p) },
    { label: 'One number (0-9)', test: (p: string) => /[0-9]/.test(p) },
    { label: 'One special character (!@#$...)', test: (p: string) => /[\W_]/.test(p) },
];

function ChangePasswordContent() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get('next') ?? '/dashboard';

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const allRulesMet = RULES.every(r => r.test(newPassword));
    const passwordsMatch = newPassword === confirm && confirm.length > 0;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!allRulesMet) { setError('Password does not meet all requirements.'); return; }
        if (!passwordsMatch) { setError('Passwords do not match.'); return; }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSuccess(true);
                setTimeout(() => router.replace(next), 1800);
            } else {
                setError(data.details ?? data.error ?? 'Failed to update password. Please try again.');
            }
        } catch {
            setError('Network error — cannot reach the server.');
        } finally {
            setLoading(false);
        }
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
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0b1220 0%, #0f1a2e 50%, #1b2f52 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '2rem 1rem', fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
            {/* Logo */}
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
                    Set New Password
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.92rem', marginTop: '0.4rem' }}>
                    Your account requires a password change before continuing
                </div>
            </div>

            <div style={{
                width: '100%', maxWidth: 440,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '1.25rem', padding: '2rem',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
            }}>
                {success ? (
                    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#10b981', marginBottom: '0.4rem' }}>
                            Password Updated!
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem' }}>
                            Redirecting you to the dashboard...
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                        {error && (
                            <div style={{
                                display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                                padding: '0.85rem 1rem', borderRadius: '0.75rem',
                                background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)',
                                color: '#fca5a5', fontSize: '0.9rem', lineHeight: 1.5,
                            }}>
                                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                                <div>{error}</div>
                            </div>
                        )}

                        {/* Current password */}
                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                                Current Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                                <input
                                    type={showOld ? 'text' : 'password'}
                                    value={oldPassword}
                                    onChange={e => setOldPassword(e.target.value)}
                                    required
                                    placeholder="Enter current password"
                                    style={{ ...inputStyle, paddingRight: '3rem' }}
                                />
                                <button type="button" onClick={() => setShowOld(v => !v)} style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex' }}>
                                    {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* New password */}
                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                                New Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                    placeholder="Create a strong password"
                                    style={{ ...inputStyle, paddingRight: '3rem' }}
                                />
                                <button type="button" onClick={() => setShowNew(v => !v)} style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex' }}>
                                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {/* Live rule checklist */}
                            {newPassword.length > 0 && (
                                <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    {RULES.map(rule => {
                                        const ok = rule.test(newPassword);
                                        return (
                                            <div key={rule.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: ok ? '#6ee7b7' : 'rgba(255,255,255,0.4)' }}>
                                                <CheckCircle size={12} color={ok ? '#10b981' : 'rgba(255,255,255,0.25)'} />
                                                {rule.label}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Confirm */}
                        <div>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                                Confirm New Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                                <input
                                    type="password"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    required
                                    placeholder="Repeat new password"
                                    style={{
                                        ...inputStyle,
                                        borderColor: confirm.length > 0 ? (passwordsMatch ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)') : 'rgba(255,255,255,0.15)',
                                    }}
                                />
                            </div>
                            {confirm.length > 0 && !passwordsMatch && (
                                <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '4px' }}>Passwords do not match</div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !allRulesMet || !passwordsMatch}
                            style={{
                                minHeight: '50px', padding: '0.9rem', borderRadius: '0.85rem', border: 'none',
                                background: (loading || !allRulesMet || !passwordsMatch)
                                    ? 'rgba(14,165,233,0.3)'
                                    : 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff', fontWeight: 800, fontSize: '1rem',
                                cursor: (loading || !allRulesMet || !passwordsMatch) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                transition: 'opacity 0.2s',
                            }}
                        >
                            {loading ? (
                                <><span style={{ display: 'inline-block', width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Updating...</>
                            ) : (
                                <><CheckCircle size={18} /> Update Password</>
                            )}
                        </button>
                    </form>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default function ChangePasswordPage() {
    return (
        <Suspense>
            <ChangePasswordContent />
        </Suspense>
    );
}
