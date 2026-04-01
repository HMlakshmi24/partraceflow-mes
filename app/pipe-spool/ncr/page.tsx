'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, ShieldAlert, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

const SEVERITY_COLORS: Record<string, string> = { MINOR: '#f59e0b', MAJOR: '#f97316', CRITICAL: '#ef4444' };
const STATUS_COLORS: Record<string, string> = { OPEN: '#ef4444', UNDER_REVIEW: '#f59e0b', DISPOSITION: '#8b5cf6', CLOSED: '#10b981' };
const STATUSES = ['OPEN', 'UNDER_REVIEW', 'DISPOSITION', 'CLOSED'];
const SEVERITIES = ['MINOR', 'MAJOR', 'CRITICAL'];

function NCRContent() {
  const searchParams = useSearchParams();
  const spoolIdFilter = searchParams.get('spoolId');
  const jointIdFilter = searchParams.get('jointId');

  const [ncrs, setNcrs] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [joints, setJoints] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showClose, setShowClose] = useState<any>(null);
  const [editing, setEditing] = useState<any>({ spoolId: spoolIdFilter ?? '', jointId: jointIdFilter ?? '', severity: 'MINOR', relatedType: 'WELD', description: '', raisedBy: '' });
  const [closeData, setCloseData] = useState({ closedBy: '', rootCause: '', disposition: '', correctiveAction: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (spoolIdFilter) params.set('spoolId', spoolIdFilter);
    if (jointIdFilter) params.set('jointId', jointIdFilter);
    const res = await fetch(`/api/pipe-spool/ncr?${params}`);
    const data = await res.json();
    setNcrs(data.ncrs ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch('/api/pipe-spool/spools').then(r => r.json()).then(d => setSpools(d.spools ?? []));
    fetch('/api/pipe-spool/joints').then(r => r.json()).then(d => setJoints(d.joints ?? []));
  }, [statusFilter, severityFilter, spoolIdFilter, jointIdFilter]);

  const filtered = ncrs.filter(n =>
    (n.ncrNumber ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (n.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (n.spool?.spoolId ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (n.joint?.jointId ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!editing.description || !editing.raisedBy) { setError('Description and Raised By are required.'); return; }
    setSaving(true); setError('');
    const payload: any = { ...editing };
    if (!payload.spoolId) delete payload.spoolId;
    if (!payload.jointId) delete payload.jointId;
    const res = await fetch('/api/pipe-spool/ncr', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setEditing({ spoolId: spoolIdFilter ?? '', jointId: jointIdFilter ?? '', severity: 'MINOR', relatedType: 'WELD', description: '', raisedBy: '' });
    load();
  };

  const handleClose = async () => {
    if (!closeData.closedBy) return;
    await fetch('/api/pipe-spool/ncr', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', id: showClose.id, ...closeData }),
    });
    setShowClose(null);
    setCloseData({ closedBy: '', rootCause: '', disposition: '', correctiveAction: '' });
    load();
  };

  const openCount = ncrs.filter(n => n.status !== 'CLOSED').length;
  const criticalCount = ncrs.filter(n => n.severity === 'CRITICAL' && n.status !== 'CLOSED').length;

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>NCR System</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Non-Conformance Reports</h1>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> Raise NCR
        </button>
      </div>

      {/* Summary banners */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Open NCRs', value: openCount, color: '#ef4444' },
          { label: 'Critical Open', value: criticalCount, color: '#dc2626' },
          { label: 'Total NCRs', value: ncrs.length, color: '#64748b' },
        ].map(s => (
          <div key={s.label} style={{ padding: '12px 20px', background: s.color + '15', border: `1px solid ${s.color}44`, borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <ShieldAlert size={16} color={s.color} />
            <span style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NCR no., description…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Severities</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Raise NCR Form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>Raise NCR</h3>
            {error && <div style={{ background: '#ef444422', color: '#ef4444', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { key: 'raisedBy', label: 'Raised By *', placeholder: 'Full name', colSpan: false },
                { key: 'relatedType', label: 'Related To', placeholder: 'e.g. WELD, MATERIAL, DIMENSION', colSpan: false },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <input value={editing[f.key] ?? ''} onChange={e => setEditing((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Severity</label>
                <select value={editing.severity} onChange={e => setEditing((p: any) => ({ ...p, severity: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Spool</label>
                <select value={editing.spoolId} onChange={e => setEditing((p: any) => ({ ...p, spoolId: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">None</option>
                  {spools.map(s => <option key={s.id} value={s.id}>{s.spoolId}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Joint</label>
                <select value={editing.jointId} onChange={e => setEditing((p: any) => ({ ...p, jointId: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">None</option>
                  {joints.map(j => <option key={j.id} value={j.id}>{j.jointId}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Description of Non-Conformance *</label>
                <textarea value={editing.description ?? ''} onChange={e => setEditing((p: any) => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Describe the non-conformance in detail…"
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none', resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Raising…' : 'Raise NCR'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Close NCR Modal */}
      {showClose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 500 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Close NCR</h3>
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13, margin: '0 0 20px' }}>{showClose.ncrNumber}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { key: 'closedBy', label: 'Closed By *', placeholder: 'Name & role' },
                { key: 'rootCause', label: 'Root Cause', placeholder: 'Root cause analysis…' },
                { key: 'disposition', label: 'Disposition', placeholder: 'e.g. Accept-as-is, Repair, Reject' },
                { key: 'correctiveAction', label: 'Corrective Action', placeholder: 'Preventive / corrective actions taken…' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <textarea value={(closeData as any)[f.key] ?? ''} onChange={e => setCloseData(p => ({ ...p, [f.key]: e.target.value }))}
                    rows={2} placeholder={f.placeholder}
                    style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none', resize: 'vertical' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowClose(null)} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleClose} style={{ padding: '8px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Close NCR</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>No NCRs raised. 👍</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['NCR Number', 'Date Raised', 'Spool / Joint', 'Severity', 'Description', 'Raised By', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ncr => {
                const sc = STATUS_COLORS[ncr.status] ?? '#64748b';
                const sev = SEVERITY_COLORS[ncr.severity] ?? '#64748b';
                return (
                  <tr key={ncr.id} style={{ borderTop: '1px solid var(--border)', background: ncr.severity === 'CRITICAL' && ncr.status !== 'CLOSED' ? '#ef444408' : 'transparent' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: '#ef4444' }}>{ncr.ncrNumber}</td>
                    <td style={{ padding: '11px 14px' }}>{new Date(ncr.raisedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '11px 14px' }}>{ncr.spool?.spoolId ?? ncr.joint?.jointId ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sev + '22', color: sev }}>{ncr.severity}</span>
                    </td>
                    <td style={{ padding: '11px 14px', maxWidth: 240 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ncr.description}</div>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{ncr.raisedBy}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc + '22', color: sc }}>{ncr.status.replace('_', ' ')}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {ncr.status !== 'CLOSED' && (
                        <button onClick={() => setShowClose(ncr)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#10b98122', color: '#10b981', border: '1px solid #10b98144', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          <CheckCircle2 size={11} /> Close
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
    </div>
  );
}

export default function NCRPage() {
  return <Suspense><NCRContent /></Suspense>;
}
