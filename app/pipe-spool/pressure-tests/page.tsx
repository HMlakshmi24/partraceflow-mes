'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, Download, FileText } from 'lucide-react';
import Link from 'next/link';

const TEST_TYPES = ['HYDROSTATIC', 'PNEUMATIC', 'LEAK_TEST'];
const RESULTS = ['PENDING', 'PASS', 'FAIL'];
const RESULT_COLORS: Record<string, string> = { PENDING: '#94a3b8', PASS: '#10b981', FAIL: '#ef4444' };

function PressureTestsContent() {
  const searchParams = useSearchParams();
  const spoolIdFilter = searchParams.get('spoolId');

  const [records, setRecords] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>({
    spoolId: spoolIdFilter ?? '', testType: 'HYDROSTATIC', result: 'PENDING',
    testPressure: '', holdTime: '', testMedium: 'Water', testedBy: '', remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (spoolIdFilter) params.set('spoolId', spoolIdFilter);
    if (resultFilter) params.set('result', resultFilter);
    const res = await fetch(`/api/pipe-spool/pressure-tests?${params}`);
    const data = await res.json();
    setRecords(data.records ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch('/api/pipe-spool/spools').then(r => r.json()).then(d => setSpools(d.spools ?? []));
  }, [spoolIdFilter, resultFilter]);

  const filtered = records.filter(r =>
    (r.spool?.spoolId ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.testedBy ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!editing.spoolId) { setError('Spool is required.'); return; }
    setSaving(true); setError('');
    const payload = {
      ...editing,
      testPressure: editing.testPressure ? parseFloat(editing.testPressure) : undefined,
      holdTime: editing.holdTime ? parseInt(editing.holdTime) : undefined,
    };
    const res = await fetch('/api/pipe-spool/pressure-tests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setEditing({ spoolId: spoolIdFilter ?? '', testType: 'HYDROSTATIC', result: 'PENDING', testPressure: '', holdTime: '', testMedium: 'Water', testedBy: '', remarks: '' });
    load();
  };

  const handleResult = async (id: string, result: string) => {
    await fetch('/api/pipe-spool/pressure-tests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_result', id, result }),
    });
    load();
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Pressure Tests</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Pressure Test Records</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/api/pipe-spool/pdf?type=pressure-test" target="_blank"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, textDecoration: 'none', color: 'var(--muted-foreground)', fontSize: 13 }}>
            <Download size={14} /> PDF Certificate
          </a>
          <button onClick={() => setShowForm(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
            background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 8,
            cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>
            <Plus size={15} /> New Test Record
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search spool, tester…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Results</option>
          {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>New Pressure Test Record</h3>
            {error && <div style={{ background: '#ef444422', color: '#ef4444', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Spool *</label>
                <select value={editing.spoolId} onChange={e => setEditing((p: any) => ({ ...p, spoolId: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Select spool…</option>
                  {spools.map(s => <option key={s.id} value={s.id}>{s.spoolId}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Test Type</label>
                <select value={editing.testType} onChange={e => setEditing((p: any) => ({ ...p, testType: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {TEST_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
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
                { key: 'testPressure', label: 'Test Pressure (bar)', placeholder: 'e.g. 15.0' },
                { key: 'holdTime', label: 'Hold Time (minutes)', placeholder: 'e.g. 30' },
                { key: 'testMedium', label: 'Test Medium', placeholder: 'Water / Air / Nitrogen' },
                { key: 'testedBy', label: 'Tested By', placeholder: 'Name & role' },
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
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Saving…' : 'Save Record'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>No pressure test records yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Spool', 'Test Type', 'Pressure (bar)', 'Hold Time', 'Medium', 'Tested By', 'Date', 'Result', 'Certificate'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(rec => {
                const rc = RESULT_COLORS[rec.result] ?? '#64748b';
                return (
                  <tr key={rec.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{rec.spool?.spoolId ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{rec.testType.replace('_', ' ')}</td>
                    <td style={{ padding: '11px 14px' }}>{rec.testPressure ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{rec.holdTime ? `${rec.holdTime} min` : '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{rec.testMedium ?? '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{rec.testedBy ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{rec.testDate ? new Date(rec.testDate).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <select value={rec.result} onChange={e => handleResult(rec.id, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: rc + '22', color: rc, border: 'none', cursor: 'pointer', outline: 'none' }}>
                        {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <a href={`/api/pipe-spool/pdf?type=pressure-test&id=${rec.id}`} target="_blank"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#06b6d4', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                        <FileText size={12} /> PDF
                      </a>
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

export default function PressureTestsPage() {
  return <Suspense><PressureTestsContent /></Suspense>;
}
