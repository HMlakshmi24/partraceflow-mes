'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, FileCheck2, ShieldCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { SignatureModal } from '@/components/SignatureModal';

interface MDR {
  id: string;
  mdrNumber: string;
  title: string | null;
  revision: string | null;
  status: string;
  preparedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  _count?: { mdrSpools: number };
}

const VALID_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'SUBMITTED', 'CLOSED'];
const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8', REVIEW: '#3b82f6', APPROVED: '#10b981', SUBMITTED: '#8b5cf6', CLOSED: '#64748b',
};

function getNextStatus(status: string): string | null {
  const idx = VALID_STATUSES.indexOf(status);
  return idx >= 0 && idx < VALID_STATUSES.length - 1 ? VALID_STATUSES[idx + 1] : null;
}

export default function MDRPage() {
  const [mdrs, setMdrs] = useState<MDR[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [toast, setToast] = useState('');
  const [signing, setSigning] = useState<{ mdr: MDR; nextStatus: string } | null>(null);
  const [advancing, setAdvancing] = useState<string | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const load = () => {
    setLoading(true);
    fetch('/api/pipe-spool/mdr', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setMdrs(d.mdrs ?? []))
      .catch(() => flash('Failed to load MDR records'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch('/api/session', { credentials: 'include' }).then(r => r.json()).then(d => setRole(d.role ?? '')).catch(() => {});
  }, []);

  const canApprove = ['ADMIN', 'SUPERVISOR', 'QUALITY'].includes(role);

  const doAdvance = async (mdr: MDR, signatureId?: string) => {
    setAdvancing(mdr.id);
    try {
      const res = await fetch('/api/pipe-spool/mdr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'advance_status', id: mdr.id, ...(signatureId ? { signatureId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) { flash(data.error ?? 'Failed to advance status'); return; }
      flash(`${mdr.mdrNumber} advanced to ${data.mdr.status}`);
      setSigning(null);
      load();
    } catch {
      flash('Network error');
    } finally {
      setAdvancing(null);
    }
  };

  const handleAdvanceClick = (mdr: MDR) => {
    const nextStatus = getNextStatus(mdr.status);
    if (!nextStatus) return;
    if (nextStatus === 'APPROVED') {
      setSigning({ mdr, nextStatus });
    } else {
      doAdvance(mdr);
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
        <span>MDR (Manufacturing Data Records)</span>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileCheck2 size={22} color="#8b5cf6" /> MDR Dossiers
      </h1>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
        ) : mdrs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>No MDR records yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['MDR #', 'Title', 'Rev', 'Spools', 'Status', 'Prepared', 'Reviewed', 'Approved', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mdrs.map(m => {
                const sc = STATUS_COLORS[m.status] ?? '#64748b';
                const nextStatus = getNextStatus(m.status);
                const isApprovalStep = nextStatus === 'APPROVED' || nextStatus === 'SUBMITTED';
                return (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{m.mdrNumber}</td>
                    <td style={{ padding: '11px 14px' }}>{m.title ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{m.revision ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{m._count?.mdrSpools ?? 0}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc + '22', color: sc }}>{m.status}</span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>{m.preparedBy ?? '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>{m.reviewedBy ?? '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>{m.approvedBy ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {nextStatus && (!isApprovalStep || canApprove) && (
                        <button
                          onClick={() => handleAdvanceClick(m)}
                          disabled={advancing === m.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                            background: nextStatus === 'APPROVED' ? '#2563eb' : 'var(--surface-muted)',
                            color: nextStatus === 'APPROVED' ? '#fff' : 'var(--foreground)',
                            border: nextStatus === 'APPROVED' ? 'none' : '1px solid var(--card-border)',
                            borderRadius: 7, cursor: advancing === m.id ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12,
                          }}
                        >
                          {nextStatus === 'APPROVED' ? <ShieldCheck size={13} /> : <ArrowRight size={13} />}
                          {nextStatus === 'APPROVED' ? 'Approve' : `Move to ${nextStatus}`}
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
          entityType="MDR"
          entityId={signing.mdr.id}
          title={`Approve MDR ${signing.mdr.mdrNumber}`}
          payload={{ nextStatus: signing.nextStatus }}
          onCancel={() => setSigning(null)}
          onSuccess={(signatureId) => doAdvance(signing.mdr, signatureId)}
        />
      )}
    </div>
  );
}
