'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const NDE_TYPES = ['RADIOGRAPHY', 'UT', 'MT', 'PT', 'VISUAL', 'PWHT'];
const RESULTS = ['PENDING', 'ACCEPTABLE', 'REJECTABLE', 'REPAIR'];
const RESULT_COLORS: Record<string, string> = {
  PENDING: '#94a3b8', ACCEPTABLE: '#10b981', REJECTABLE: '#ef4444', REPAIR: '#f59e0b',
};

function NDEContent() {
  const searchParams = useSearchParams();
  const jointIdFilter = searchParams.get('jointId');

  const [records, setRecords] = useState<any[]>([]);
  const [joints, setJoints] = useState<{ id: string; jointId: string }[]>([]);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [holdOnly, setHoldOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>({ jointId: jointIdFilter ?? '', ndeType: 'RADIOGRAPHY', result: 'PENDING', holdFlag: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (jointIdFilter) params.set('jointId', jointIdFilter);
    if (resultFilter) params.set('result', resultFilter);
    if (typeFilter) params.set('ndeType', typeFilter);
    if (holdOnly) params.set('holdOnly', 'true');
    const res = await fetch(`/api/pipe-spool/nde?${params}`);
    const data = await res.json();
    setRecords(data.records ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch('/api/pipe-spool/joints').then(r => r.json()).then(d => setJoints(d.joints ?? []));
  }, [jointIdFilter, resultFilter, typeFilter, holdOnly]);

  const filtered = records.filter(r =>
    (r.joint?.jointId ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.reportNumber ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.ndeContractor ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!editing.jointId) { setError('Joint is required.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/pipe-spool/nde', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setEditing({ jointId: jointIdFilter ?? '', ndeType: 'RADIOGRAPHY', result: 'PENDING', holdFlag: false });
    load();
  };

  const handleResultChange = async (id: string, result: string, holdFlag: boolean) => {
    await fetch('/api/pipe-spool/nde', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_result', id, result, holdFlag }),
    });
    load();
  };

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>NDE / RT</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>NDE Records</h1>
          <p style={{ color: 'var(--muted-foreground)', margin: '4px 0 0', fontSize: 13 }}>Radiography · Ultrasonic · Magnetic Particle · Penetrant · Visual</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#10b981', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> New NDE Record
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search joint, report, contractor…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Types</option>
          {NDE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Results</option>
          {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '9px 12px', background: holdOnly ? '#f59e0b22' : 'var(--card-bg)', border: `1px solid ${holdOnly ? '#f59e0b' : 'var(--card-border)'}`, borderRadius: 8, color: holdOnly ? '#f59e0b' : 'var(--foreground)' }}>
          <input type="checkbox" checked={holdOnly} onChange={e => setHoldOnly(e.target.checked)} />
          <AlertTriangle size={13} /> Holds only
        </label>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)', alignSelf: 'center' }}>{filtered.length} records</span>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>New NDE Record</h3>
            {error && <div style={{ background: '#ef444422', color: '#ef4444', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Joint *</label>
                <select value={editing.jointId} onChange={e => setEditing((p: any) => ({ ...p, jointId: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Select joint…</option>
                  {joints.map(j => <option key={j.id} value={j.id}>{j.jointId}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>NDE Type</label>
                <select value={editing.ndeType} onChange={e => setEditing((p: any) => ({ ...p, ndeType: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {NDE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Result</label>
                <select value={editing.result} onChange={e => setEditing((p: any) => ({ ...p, result: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {[
                { key: 'reportNumber', label: 'Report Number', placeholder: 'RT-001' },
                { key: 'ndeContractor', label: 'NDE Contractor', placeholder: 'Company name' },
                { key: 'ndeOperator', label: 'NDE Operator', placeholder: 'Operator name' },
                { key: 'technique', label: 'Technique', placeholder: 'e.g. SWSI, DWSI' },
                { key: 'acceptance', label: 'Acceptance Code', placeholder: 'e.g. ASME B31.3' },
                { key: 'filmDensity', label: 'Film Density', placeholder: '2.0 - 4.0' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <input value={editing[f.key] ?? ''} onChange={e => setEditing((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Remarks</label>
                <textarea value={editing.remarks ?? ''} onChange={e => setEditing((p: any) => ({ ...p, remarks: e.target.value }))}
                  rows={2} style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none', resize: 'vertical' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', gridColumn: '1/-1' }}>
                <input type="checkbox" checked={editing.holdFlag ?? false} onChange={e => setEditing((p: any) => ({ ...p, holdFlag: e.target.checked }))} />
                Place on HOLD (NDE re-test required)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Saving…' : 'Save Record'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>No NDE records yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Date', 'Joint', 'NDE Type', 'Report No.', 'Contractor / Operator', 'Technique', 'Result', 'Hold', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(rec => {
                const rc = RESULT_COLORS[rec.result] ?? '#64748b';
                return (
                  <tr key={rec.id} style={{ borderTop: '1px solid var(--border)', background: rec.holdFlag ? '#f59e0b08' : 'transparent' }}>
                    <td style={{ padding: '11px 14px' }}>{rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{rec.joint?.jointId ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: '#06b6d422', color: '#06b6d4' }}>{rec.ndeType}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{rec.reportNumber ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{[rec.ndeContractor, rec.ndeOperator].filter(Boolean).join(' / ') || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{rec.technique ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <select value={rec.result} onChange={e => handleResultChange(rec.id, e.target.value, rec.holdFlag)}
                        style={{ padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: rc + '22', color: rc, border: 'none', cursor: 'pointer', outline: 'none' }}>
                        {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {rec.holdFlag && <AlertTriangle size={14} color="#f59e0b" />}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <button onClick={() => handleResultChange(rec.id, rec.result, !rec.holdFlag)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: rec.holdFlag ? '#ef4444' : 'var(--muted-foreground)' }}>
                        {rec.holdFlag ? 'Release Hold' : 'Set Hold'}
                      </button>
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

export default function NDEPage() {
  return <Suspense><NDEContent /></Suspense>;
}
