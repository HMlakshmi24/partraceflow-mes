'use client';

import { useState } from 'react';
import { ShieldCheck, X, AlertCircle, Lock } from 'lucide-react';

interface SignatureModalProps {
  /** What's being signed, e.g. "PWHTCycle", "MDR", "SpoolInspection" — must
   * match entityType exactly as the consuming approval route checks it. */
  entityType: string;
  entityId: string;
  /** Short human-readable description of the action, e.g. "Approve PWHT cycle PWHT-1002". */
  title: string;
  /** The exact decision content being attested — must match, field-for-field,
   * what the follow-up approval call will actually submit, or the signature
   * will be rejected as content-mismatched (see ElectronicSignatureService). */
  payload: unknown;
  onCancel: () => void;
  onSuccess: (signatureId: string) => void;
}

/**
 * Password re-entry modal for electronic-signature-gated approval actions
 * (PWHT approval, MDR advance-to-APPROVED, inspection pass/fail recording).
 *
 * Calls POST /api/auth/verify-signature with the current user's password,
 * a reason, and the payload being attested. On success, hands the caller a
 * signatureId to include in the actual approval request — the approval
 * route re-hashes what it's about to commit and rejects the signature if it
 * doesn't match what was shown here (see ElectronicSignatureService.
 * verifySignatureForEntity), so this modal's payload must be kept in sync
 * with what the caller actually submits afterward.
 */
export function SignatureModal({ entityType, entityId, title, payload, onCancel, onSuccess }: SignatureModalProps) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Password is required.'); return; }
    if (!reason.trim()) { setError('A reason for this decision is required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, entityType, entityId, reason, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Signature verification failed.');
        setSubmitting(false);
        return;
      }
      onSuccess(data.signatureId);
    } catch {
      setError('Network error — could not reach the server.');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--card-bg, #fff)', borderRadius: '1rem', padding: '1.75rem',
          width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary, #3b82f6)' }}>
            <ShieldCheck size={20} />
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Electronic Signature Required</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={submitting}
            style={{ background: 'none', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', color: 'var(--muted-foreground, #6b7280)' }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ margin: '0 0 1.1rem', fontSize: '0.85rem', color: 'var(--muted-foreground, #6b7280)', lineHeight: 1.5 }}>
          {title}. Re-enter your password to sign this action. This creates a
          permanent, tamper-evident record of who approved it and exactly what was approved.
        </p>

        {error && (
          <div style={{
            display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.7rem 0.85rem',
            borderRadius: '0.6rem', background: '#fef2f2', border: '1px solid #fecaca',
            color: '#991b1b', fontSize: '0.82rem', marginBottom: '1rem', lineHeight: 1.4,
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{error}</div>
          </div>
        )}

        <div style={{ marginBottom: '0.9rem' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground, #111)', marginBottom: '0.3rem' }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground, #9ca3af)' }} />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              disabled={submitting}
              style={{
                width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem', borderRadius: '0.5rem',
                border: '1px solid var(--card-border, #d1d5db)', fontSize: '0.88rem', boxSizing: 'border-box',
                background: 'var(--surface-muted, #f9fafb)', color: 'var(--foreground, #111)',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '1.3rem' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground, #111)', marginBottom: '0.3rem' }}>
            Reason / comment
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            disabled={submitting}
            placeholder="e.g. Reviewed against WPS and NDE records, meets acceptance criteria"
            style={{
              width: '100%', padding: '0.55rem 0.75rem', borderRadius: '0.5rem',
              border: '1px solid var(--card-border, #d1d5db)', fontSize: '0.85rem', boxSizing: 'border-box',
              background: 'var(--surface-muted, #f9fafb)', color: 'var(--foreground, #111)', resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={submitting}
            style={{
              padding: '0.55rem 1.1rem', borderRadius: '0.5rem', border: '1px solid var(--card-border, #d1d5db)',
              background: 'none', color: 'var(--foreground, #111)', cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: '0.85rem',
            }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !password || !reason.trim()}
            style={{
              padding: '0.55rem 1.3rem', borderRadius: '0.5rem', border: 'none',
              background: (submitting || !password || !reason.trim()) ? '#93c5fd' : '#2563eb',
              color: '#fff', cursor: (submitting || !password || !reason.trim()) ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
            {submitting ? 'Verifying…' : <><ShieldCheck size={15} /> Sign &amp; Continue</>}
          </button>
        </div>
      </form>
    </div>
  );
}
