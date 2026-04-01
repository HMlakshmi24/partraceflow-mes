'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, ChevronRight, FileText, Pencil, Trash2, Download } from 'lucide-react';
import Link from 'next/link';

const STATUSES = ['IFR', 'IFC', 'AFC', 'SUPERSEDED'];
const STATUS_COLORS: Record<string, string> = { IFR: '#f59e0b', IFC: '#3b82f6', AFC: '#10b981', SUPERSEDED: '#94a3b8' };
const STATUS_LABELS: Record<string, string> = { IFR: 'Issued for Review', IFC: 'Issued for Construction', AFC: 'Approved for Construction', SUPERSEDED: 'Superseded' };

interface Drawing {
  id: string;
  drawingNumber: string;
  title?: string;
  lineId: string;
  revision: string;
  status: string;
  filePath?: string;
  issuedDate?: string;
  issuedBy?: string;
  approvedBy?: string;
  notes?: string;
  line?: { lineNumber: string };
  spools?: { id: string; spoolId: string }[];
}

export default function DrawingsPage() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [lines, setLines] = useState<{ id: string; lineNumber: string }[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>({ drawingNumber: '', lineId: '', revision: 'A', status: 'IFR', title: '', issuedBy: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    // Fetch lines and their drawings
    const res = await fetch('/api/pipe-spool/lines');
    const data = await res.json();
    const allLines = data.lines ?? [];
    setLines(allLines);

    // Collect drawings from all lines with id
    const drawRes = await fetch('/api/pipe-spool/drawings');
    if (drawRes.ok) {
      const drawData = await drawRes.json();
      setDrawings(drawData.drawings ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = drawings.filter(d =>
    d.drawingNumber.toLowerCase().includes(search.toLowerCase()) ||
    (d.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (d.line?.lineNumber ?? '').toLowerCase().includes(search.toLowerCase())
  ).filter(d => !statusFilter || d.status === statusFilter);

  const handleSave = async () => {
    if (!editing.drawingNumber || !editing.lineId) { setError('Drawing number and line are required.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/pipe-spool/drawings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setEditing({ drawingNumber: '', lineId: '', revision: 'A', status: 'IFR', title: '', issuedBy: '' });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this drawing?')) return;
    await fetch('/api/pipe-spool/drawings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
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
            <span>Isometric Drawings</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Isometric Drawing Register</h1>
          <p style={{ color: 'var(--muted-foreground)', margin: '4px 0 0', fontSize: 13 }}>IFR → IFC → AFC revision control · linked to lines &amp; spools</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> Register Drawing
        </button>
      </div>

      {/* Revision status legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)} style={{
            padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
            background: statusFilter === s ? STATUS_COLORS[s] + '33' : STATUS_COLORS[s] + '15',
            color: STATUS_COLORS[s], border: `1px solid ${STATUS_COLORS[s]}44`,
            cursor: 'pointer',
          }}>
            {s} — {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drawing number, title, line…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)', alignSelf: 'center' }}>{filtered.length} drawings</span>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 540, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>{editing.id ? 'Edit Drawing' : 'Register Drawing'}</h3>
            {error && <div style={{ background: '#ef444422', color: '#ef4444', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Line *</label>
                <select value={editing.lineId} onChange={e => setEditing((p: any) => ({ ...p, lineId: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  <option value="">Select line…</option>
                  {lines.map(l => <option key={l.id} value={l.id}>{l.lineNumber}</option>)}
                </select>
              </div>
              {[
                { key: 'drawingNumber', label: 'Drawing Number *', placeholder: 'e.g. ISO-6"-P-001-A1A' },
                { key: 'title', label: 'Title', placeholder: 'e.g. Process Gas Line Isometric' },
                { key: 'revision', label: 'Revision', placeholder: 'A' },
                { key: 'issuedBy', label: 'Issued By', placeholder: 'Engineer name' },
                { key: 'approvedBy', label: 'Approved By', placeholder: 'QA/Lead name' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <input value={editing[f.key] ?? ''} onChange={e => setEditing((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Status</label>
                <select value={editing.status} onChange={e => setEditing((p: any) => ({ ...p, status: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {STATUSES.map(s => <option key={s} value={s}>{s} — {STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Notes</label>
                <textarea value={editing.notes ?? ''} onChange={e => setEditing((p: any) => ({ ...p, notes: e.target.value }))}
                  rows={2} style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none', resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Saving…' : 'Save Drawing'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
            {search ? 'No drawings match.' : 'No drawings registered yet. Click "Register Drawing" to add one.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Drawing No.', 'Title', 'Line', 'Rev', 'Status', 'Issued By', 'Approved By', 'Spools', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const sc = STATUS_COLORS[d.status] ?? '#64748b';
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={13} color="#3b82f6" />
                        <span style={{ fontWeight: 600 }}>{d.drawingNumber}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{d.title ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Link href={`/pipe-spool/line-list?id=${d.lineId}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                        {d.line?.lineNumber ?? '—'}
                      </Link>
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 700 }}>{d.revision}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc + '22', color: sc }}>{d.status}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{d.issuedBy ?? '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{d.approvedBy ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Link href={`/pipe-spool/spools?drawingId=${d.id}`} style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600, fontSize: 12 }}>
                        {d.spools?.length ?? 0} spools
                      </Link>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditing(d); setShowForm(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4 }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
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
