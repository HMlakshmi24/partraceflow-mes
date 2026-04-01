'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Line {
  id: string;
  lineNumber: string;
  area: string;
  service?: string;
  pidNumber?: string;
  designPressure?: number;
  designTemp?: number;
  material?: string;
  size?: string;
  revision: string;
  status: string;
  _count?: { spools: number; drawings: number };
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#10b981', ON_HOLD: '#f59e0b', COMPLETED: '#3b82f6', CANCELLED: '#ef4444',
};

const EMPTY: Partial<Line> = { lineNumber: '', area: '', service: '', pidNumber: '', material: '', size: '', revision: 'A', status: 'ACTIVE' };

export default function LineListPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Partial<Line>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/pipe-spool/lines');
    const data = await res.json();
    setLines(data.lines ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = lines.filter(l =>
    l.lineNumber.toLowerCase().includes(search.toLowerCase()) ||
    (l.area ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.service ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!editing.lineNumber || !editing.area) { setError('Line number and area are required.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/pipe-spool/lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing.id ? { id: editing.id, ...editing } : editing),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false);
    setShowForm(false);
    setEditing(EMPTY);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this line? All linked spools and drawings will be affected.')) return;
    await fetch('/api/pipe-spool/lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    load();
  };

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Line List</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Line List</h1>
        </div>
        <button onClick={() => { setEditing(EMPTY); setShowForm(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> New Line
        </button>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search line number, area, service…"
            style={{
              width: '100%', padding: '9px 10px 9px 32px',
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none',
            }}
          />
        </div>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{filtered.length} lines</span>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 540,
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>{editing.id ? 'Edit Line' : 'New Line'}</h3>
            {error && <div style={{ background: '#ef444422', color: '#ef4444', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { key: 'lineNumber', label: 'Line Number *', placeholder: 'e.g. 6"-P-001-A1A' },
                { key: 'area', label: 'Area *', placeholder: 'e.g. TOPSIDES-A' },
                { key: 'service', label: 'Service', placeholder: 'e.g. Process Gas' },
                { key: 'pidNumber', label: 'P&ID Number', placeholder: 'e.g. PID-001' },
                { key: 'material', label: 'Material', placeholder: 'e.g. CS A106 Gr.B' },
                { key: 'size', label: 'Size', placeholder: 'e.g. 6"-SCH40' },
                { key: 'designPressure', label: 'Design Pressure (bar)', placeholder: '0' },
                { key: 'designTemp', label: 'Design Temp (°C)', placeholder: '0' },
                { key: 'revision', label: 'Revision', placeholder: 'A' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <input
                    value={(editing as any)[f.key] ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{
                      padding: '8px 10px', background: 'var(--surface-muted)',
                      border: '1px solid var(--card-border)', borderRadius: 7,
                      fontSize: 13, color: 'var(--foreground)', outline: 'none',
                    }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Status</label>
                <select
                  value={editing.status ?? 'ACTIVE'}
                  onChange={e => setEditing(prev => ({ ...prev, status: e.target.value }))}
                  style={{
                    padding: '8px 10px', background: 'var(--surface-muted)',
                    border: '1px solid var(--card-border)', borderRadius: 7,
                    fontSize: 13, color: 'var(--foreground)', outline: 'none',
                  }}
                >
                  {['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{
                padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)',
                borderRadius: 8, cursor: 'pointer', fontSize: 13,
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '8px 18px', background: '#3b82f6', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>{saving ? 'Saving…' : 'Save Line'}</button>
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
            {search ? 'No lines match your search.' : 'No lines yet. Click "New Line" to add the first one.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Line Number', 'Area', 'Service', 'P&ID', 'Size / Material', 'Rev', 'Spools', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(line => (
                <tr key={line.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--foreground)' }}>{line.lineNumber}</td>
                  <td style={{ padding: '11px 14px' }}>{line.area}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{line.service ?? '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{line.pidNumber ?? '—'}</td>
                  <td style={{ padding: '11px 14px' }}>{[line.size, line.material].filter(Boolean).join(' / ') || '—'}</td>
                  <td style={{ padding: '11px 14px' }}>{line.revision}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <Link href={`/pipe-spool/spools?lineId=${line.id}`} style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                      {line._count?.spools ?? 0}
                    </Link>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: (STATUS_COLORS[line.status] ?? '#64748b') + '22',
                      color: STATUS_COLORS[line.status] ?? '#64748b',
                    }}>{line.status.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditing(line); setShowForm(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4 }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(line.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
