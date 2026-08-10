'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { ShieldCheck, AlertCircle, CheckCircle, Factory, Copy, Download, KeyRound } from 'lucide-react';

function MfaSetupContent() {
    const router = useRouter();
    const params = useSearchParams();
    const next = params.get('next') ?? '/dashboard';

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [secret, setSecret] = useState('');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const [code, setCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const [finishing, setFinishing] = useState(false);

    const loadSetup = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/auth/mfa/setup', { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'Could not start MFA setup.'); return; }
            setSecret(data.secret);
            setQrCodeDataUrl(data.qrCodeDataUrl);
        } catch {
            setError('Network error — cannot reach the server.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadSetup(); }, [loadSetup]);

    async function handleVerify(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your authenticator app.'); return; }
        setVerifying(true);
        try {
            const res = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: code }),
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'Invalid code. Please try again.'); return; }
            setBackupCodes(data.backupCodes);
        } catch {
            setError('Network error — cannot reach the server.');
        } finally {
            setVerifying(false);
        }
    }

    function handleFinish() {
        setFinishing(true);
        router.replace(next);
    }

    const copyBackupCodes = () => {
        if (backupCodes) navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {});
    };

    const downloadBackupCodes = () => {
        if (!backupCodes) return;
        const blob = new Blob(
            [`ParTraceflow MES — MFA backup codes\nGenerated: ${new Date().toISOString()}\nEach code can be used once if you lose access to your authenticator app.\n\n${backupCodes.join('\n')}\n`],
            { type: 'text/plain' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'mes-mfa-backup-codes.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.85rem 0.9rem', borderRadius: '0.75rem',
        border: '1.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)',
        color: '#fff', fontSize: '1.4rem', letterSpacing: '0.4em', textAlign: 'center',
        boxSizing: 'border-box', outline: 'none', fontVariantNumeric: 'tabular-nums',
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
                    Set Up Two-Factor Authentication
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.92rem', marginTop: '0.4rem', maxWidth: 440 }}>
                    Required for every account before you can continue
                </div>
            </div>

            <div style={{
                width: '100%', maxWidth: 460,
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

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: 'rgba(255,255,255,0.5)' }}>Loading…</div>
                ) : backupCodes ? (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6ee7b7', fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.6rem' }}>
                            <CheckCircle size={20} /> Authenticator connected
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.88rem', lineHeight: 1.5, marginTop: 0 }}>
                            Save these backup codes somewhere safe. Each one can be used <strong>once</strong> to sign in if you lose access to your authenticator app. They will not be shown again.
                        </p>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
                            background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '0.75rem', padding: '1rem', margin: '1rem 0',
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.92rem', color: '#e2e8f0',
                        }}>
                            {backupCodes.map(c => <div key={c}>{c}</div>)}
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.2rem' }}>
                            <button type="button" onClick={copyBackupCodes} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                <Copy size={14} /> Copy
                            </button>
                            <button type="button" onClick={downloadBackupCodes} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '0.6rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                                <Download size={14} /> Download
                            </button>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '1.2rem' }}>
                            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} style={{ marginTop: 3 }} />
                            I have saved these backup codes in a safe place
                        </label>
                        <button
                            type="button"
                            onClick={handleFinish}
                            disabled={!acknowledged || finishing}
                            style={{
                                width: '100%', minHeight: '50px', padding: '0.9rem', borderRadius: '0.85rem', border: 'none',
                                background: (!acknowledged || finishing) ? 'rgba(16,185,129,0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff', fontWeight: 800, fontSize: '1rem',
                                cursor: (!acknowledged || finishing) ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            }}
                        >
                            <ShieldCheck size={18} /> Continue to MES
                        </button>
                    </div>
                ) : (
                    <>
                        <ol style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.88rem', lineHeight: 1.7, paddingLeft: '1.2rem', margin: '0 0 1.2rem' }}>
                            <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc.)</li>
                            <li>Scan the QR code below, or enter the setup key manually</li>
                            <li>Enter the 6-digit code the app generates to confirm</li>
                        </ol>

                        {qrCodeDataUrl && (
                            <div style={{ textAlign: 'center', margin: '0 0 1.2rem' }}>
                                <div style={{ display: 'inline-block', background: '#fff', padding: '0.75rem', borderRadius: '0.75rem' }}>
                                    {/* Server-generated data: URI QR code — not user-controllable input */}
                                    <Image src={qrCodeDataUrl} alt="MFA setup QR code" width={180} height={180} unoptimized />
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '1.4rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                <KeyRound size={12} /> Can&apos;t scan? Enter this key manually:
                            </label>
                            <div style={{
                                fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.9rem', color: '#e2e8f0',
                                background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '0.6rem', padding: '0.6rem 0.75rem', wordBreak: 'break-all',
                            }}>
                                {secret}
                            </div>
                        </div>

                        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                                    Verification code
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    style={inputStyle}
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={verifying || code.length !== 6}
                                style={{
                                    minHeight: '50px', padding: '0.9rem', borderRadius: '0.85rem', border: 'none',
                                    background: (verifying || code.length !== 6) ? 'rgba(14,165,233,0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
                                    color: '#fff', fontWeight: 800, fontSize: '1rem',
                                    cursor: (verifying || code.length !== 6) ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                }}
                            >
                                {verifying ? 'Verifying…' : <><ShieldCheck size={18} /> Verify & Enable</>}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

export default function MfaSetupPage() {
    return (
        <Suspense>
            <MfaSetupContent />
        </Suspense>
    );
}
