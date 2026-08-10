'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Eye, EyeOff, Crown, HardHat, Wrench, ShieldCheck, User, Settings } from 'lucide-react';

interface RoleCard {
  role: string;
  label: string;
  desc: string;
  color: string;
  borderColor: string;
  icon: React.ReactNode;
}

// SECURITY fix: this previously embedded real, working credentials
// (including a live ADMIN password) directly in the client bundle — anyone
// loading /login could become ADMIN with one click, no password needed, in
// every build including production. These cards now carry only a role; the
// server (/api/auth/demo-login) decides whether to honor it, and only ever
// does so when the deployment itself is in demo mode — see that route for
// the full explanation.
const ROLE_CARDS: RoleCard[] = [
  { role: 'ADMIN', label: 'Administrator', desc: 'Full system access', color: '#a78bfa', borderColor: '#7c3aed', icon: <Crown size={32} /> },
  { role: 'SUPERVISOR', label: 'Supervisor', desc: 'Manage production floor', color: '#22d3ee', borderColor: '#06b6d4', icon: <HardHat size={32} /> },
  { role: 'OPERATOR', label: 'Operator / Worker', desc: 'Log your work and tasks', color: '#34d399', borderColor: '#10b981', icon: <Wrench size={32} /> },
  { role: 'QUALITY', label: 'Quality Inspector', desc: 'Inspect and approve work', color: '#fbbf24', borderColor: '#f59e0b', icon: <ShieldCheck size={32} /> },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  // Quick-sign-in cards only render once the server confirms this
  // deployment is actually in demo mode (see /api/auth/demo-login) —
  // defaults to hidden so there's no flash of the cards on a production
  // deployment while the check is in flight.
  const [demoModeAvailable, setDemoModeAvailable] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { if (d?.demoMode) setDemoModeAvailable(true); })
      .catch(() => {});
  }, []);

  const reasonMessages: Record<string, string> = {
    session_expired: 'Your session has expired. Please sign in again.',
    idle_timeout: 'You were signed out due to inactivity.',
    user_logout: 'You have been signed out.',
    revoked: 'Your session was revoked by an administrator.',
  };

  function handleLoginResponse(res: Response, data: { error?: string; mustChangePassword?: boolean; mfaSetupRequired?: boolean; mfaVerificationRequired?: boolean }) {
    if (!res.ok) {
      setError(data.error || 'Login failed');
      return;
    }
    if (data.mustChangePassword) {
      router.replace('/change-password');
      return;
    }
    // proxy.ts would redirect here anyway (MFA is mandatory for every
    // account), but sending the browser straight to the right step avoids a
    // pointless extra hop through /dashboard first.
    if (data.mfaSetupRequired) {
      router.replace('/mfa-setup');
      return;
    }
    if (data.mfaVerificationRequired) {
      router.replace('/mfa-verify');
      return;
    }
    router.replace('/dashboard');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      handleLoginResponse(res, await res.json());
    } catch {
      setError('Unable to reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleClick(card: RoleCard) {
    setError('');
    setLoadingRole(card.role);
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: card.role }),
      });
      handleLoginResponse(res, await res.json());
    } catch {
      setError('Unable to reach the server. Check your connection.');
    } finally {
      setLoadingRole(null);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0f1e 0%, #111827 50%, #0a0f1e 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '2rem 1rem',
      gap: '1.5rem',
    }}>
      {/* Branding */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, margin: '0 auto 0.75rem',
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.6rem', fontWeight: 900, color: '#fff',
        }}>
          MES
        </div>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
          ParTraceflow MES
        </h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
          Manufacturing Execution System
        </p>
      </div>

      {/* Role Quick-Select Cards — demo-mode deployments only. The server
          (/api/auth/demo-login) is the real gate; this client check just
          avoids showing buttons that would 403 on a production deployment. */}
      {demoModeAvailable && (
        <>
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 700 }}>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Demo mode — select a role to sign in instantly
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              {ROLE_CARDS.map(card => (
                <button
                  key={card.role}
                  onClick={() => handleRoleClick(card)}
                  disabled={loadingRole !== null}
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: `2px solid ${loadingRole === card.role ? card.color : card.borderColor + '60'}`,
                    borderRadius: 14,
                    padding: '1.25rem 0.75rem',
                    cursor: loadingRole !== null ? 'wait' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
                    transition: 'all 0.2s',
                    opacity: loadingRole && loadingRole !== card.role ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!loadingRole) (e.currentTarget.style.borderColor = card.color); }}
                  onMouseLeave={e => { if (!loadingRole) (e.currentTarget.style.borderColor = card.borderColor + '60'); }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: card.borderColor + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: card.color,
                  }}>
                    {card.icon}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>{card.label}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{card.desc}</div>
                  <div style={{ fontSize: '0.75rem', color: card.color, fontWeight: 600 }}>
                    {loadingRole === card.role ? 'Signing in...' : 'Click to Sign In'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', maxWidth: 500 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.15)' }} />
            <span style={{ color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>or enter your credentials manually</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.15)' }} />
          </div>
        </>
      )}

      {/* Manual Login Form */}
      <div style={{
        width: '100%', maxWidth: 500, padding: '2rem',
        background: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: 16,
      }}>
        {reason && reasonMessages[reason] && (
          <div style={{
            padding: '0.75rem 1rem', marginBottom: '1.25rem',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 10, color: '#fbbf24', fontSize: '0.84rem', fontWeight: 500,
          }}>
            {reasonMessages[reason]}
          </div>
        )}

        {error && (
          <div style={{
            padding: '0.75rem 1rem', marginBottom: '1.25rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 10, color: '#f87171', fontSize: '0.84rem', fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.1rem' }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Enter your username"
                style={{
                  width: '100%', padding: '0.75rem 0.9rem 0.75rem 2.5rem',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 10, color: '#f1f5f9', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = 'rgba(148, 163, 184, 0.2)'}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Settings size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                style={{
                  width: '100%', padding: '0.75rem 2.8rem 0.75rem 2.5rem',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 10, color: '#f1f5f9', fontSize: '0.95rem',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = 'rgba(148, 163, 184, 0.2)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                  padding: 4, display: 'flex', alignItems: 'center',
                }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.85rem',
              background: loading ? '#475569' : 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              border: 'none', borderRadius: 10,
              color: '#fff', fontSize: '1rem', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}
          >
            <ShieldCheck size={18} />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0f1e' }} />}>
      <LoginForm />
    </Suspense>
  );
}
