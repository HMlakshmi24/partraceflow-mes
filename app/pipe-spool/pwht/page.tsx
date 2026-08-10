'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Flame, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { SignatureModal } from '@/components/SignatureModal';

interface PWHTCycle {
  id: string;
  cycleNumber: string | null;
  furnaceId: string | null;
  chargeNumber: string | null;
  soakTemp: number | null;
  soakDuration: number | null;
  operator: string | null;
  result: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  spool?: { spoolId: string };
}

const RESULT_COLORS: Record<string, string> = { PASS: '#10b981', FAIL: '#ef4444', PENDING: '#94a3b8' };

export default function PWHTPage() {
  const [cycles, setCycles] = useState<PWHTCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [toast, setToast] = useState('');
  const [signing, setSigning] = useState<PWHTCycle | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = () => {
    setLoading(true);
    fetch('/api/pipe-spool/pwht', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCycles(d.cycles ?? []))
      .catch(() => flash('Failed to load PWHT cycles'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch('/api/session', { credentials: 'include' }).then(r => r.json()).then(d => setRole(d.role ?? '')).catch(() => {});
  }, []);

  const canApprove = ['ADMIN', 'SUPERVISOR', 'QUALITY'].includes(role);

  const handleSignatureSuccess = async (signatureId: string) => {
    if (!signing) return;
    setApproving(signing.id);
    try {
      const res = await fetch('/api/pipe-spool/pwht', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'approve', id: signing.id, signatureId }),
      });
      const data = await res.json();
      if (!res.ok) { flash(data.error ?? 'Approval failed'); return; }
      flash(`PWHT cycle ${signing.cycleNumber ?? signing.id} approved`);
      setSigning(null);
      load();
    } catch {
      flash('Network error');
    } finally {
      setApproving(null);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999, background: '#1e293b', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: '0.75rem', fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
        <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
        <ChevronRight size={14} />
        <span>PWHT Cycles</span>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Flame size={22} color="#f97316" /> PWHT Cycles
      </h1>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
        ) : cycles.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>No PWHT cycles recorded yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Cycle #', 'Spool', 'Furnace', 'Charge #', 'Soak Temp/Time', 'Operator', 'Result', 'Approval', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycles.map(c => {
                const rc = RESULT_COLORS[c.result] ?? '#64748b';
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{c.cycleNumber ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{c.spool?.spoolId ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{c.furnaceId ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{c.chargeNumber ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{c.soakTemp ? `${c.soakTemp}°C` : '—'}{c.soakDuration ? ` / ${c.soakDuration}min` : ''}</td>
                    <td style={{ padding: '11px 14px' }}>{c.operator ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: rc + '22', color: rc }}>{c.result}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {c.approved ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#10b981', fontSize: 12, fontWeight: 600 }}>
                          <CheckCircle2 size={13} /> {c.approvedBy}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>Pending</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {!c.approved && canApprove && (
                        <button
                          onClick={() => setSigning(c)}
                          disabled={approving === c.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                            background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7,
                            cursor: approving === c.id ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12,
                          }}
                        >
                          <ShieldCheck size={13} /> Approve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {signing && (
        <SignatureModal
          entityType="PWHTCycle"
          entityId={signing.id}
          title={`Approve PWHT cycle ${signing.cycleNumber ?? signing.id} for spool ${signing.spool?.spoolId ?? ''}`}
          payload={{ result: 'PASS', approved: true }}
          onCancel={() => setSigning(null)}
          onSuccess={handleSignatureSuccess}
        />
      )}
    </div>
  );
}
