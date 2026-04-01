'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, Tag, MapPin } from 'lucide-react';
import Link from 'next/link';
import {
  SPOOL_STATUSES,
  SPOOL_STATUS_COLORS,
  SPOOL_FLOW_STEPS,
  getSpoolFlowStepIndex,
  formatStatus,
} from '@/lib/spoolStatus';

interface Spool {
  id: string;
  spoolId: string;
  lineId: string;
  status: string;
  rfidTag1?: string;
  rfidTag2?: string;
  barcode?: string;
  weight?: number;
  material?: string;
  size?: string;
  storageZone?: string;
  storageRack?: string;
  storageRow?: string;
  storagePosition?: string;
  receivedAt?: string;
  issuedTo?: string;
  line?: { lineNumber: string; area: string };
  _count?: { joints: number; ncrs: number };
}

const EMPTY_SPOOL = { spoolId: '', lineId: '', status: 'FABRICATING', rfidTag1: '', rfidTag2: '', barcode: '', weight: '', material: '', size: '' };

function FlowTracker({ status }: { status: string }) {
  const idx = getSpoolFlowStepIndex(status);
  const isHold = status === 'HOLD';
  const isRepair = status === 'REPAIR';

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      {SPOOL_FLOW_STEPS.map((step, i) => {
        const active = idx === i;
        const done = idx !== null && i < idx;
        const color = active ? '#0ea5e9' : done ? '#10b981' : 'var(--muted-foreground)';
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 99,
              background: color, boxShadow: active ? `0 0 0 3px ${color}22` : 'none',
            }} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 600, color }}>{step.label}</span>
            {i < SPOOL_FLOW_STEPS.length - 1 && (
              <span style={{ fontSize: 10, color: done ? '#10b981' : '#94a3b8' }}>→</span>
            )}
          </div>
        );
      })}
      {isHold && (
        <span style={{
          marginLeft: 4, padding: '2px 8px', borderRadius: 99,
          background: '#ef444422', color: '#ef4444', fontSize: 10, fontWeight: 800,
        }}>HOLD</span>
      )}
      {isRepair && (
        <span style={{
          marginLeft: 4, padding: '2px 8px', borderRadius: 99,
          background: '#f9731622', color: '#f97316', fontSize: 10, fontWeight: 800,
        }}>REPAIR</span>
      )}
    </div>
  );
}

function SpoolsContent() {
  const searchParams = useSearchParams();
  const lineIdFilter = searchParams.get('lineId');

  const [spools, setSpools] = useState<Spool[]>([]);
  const [lines, setLines] = useState<{ id: string; lineNumber: string }[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>({ ...EMPTY_SPOOL, lineId: lineIdFilter ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rfidScan, setRfidScan] = useState('');
  const [scanResult, setScanResult] = useState<Spool | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (lineIdFilter) params.set('lineId', lineIdFilter);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/pipe-spool/spools?${params}`);
    const data = await res.json();
    setSpools(data.spools ?? []);
    setLoading(false);
  };

  const loadLines = async () => {
    const res = await fetch('/api/pipe-spool/lines');
    const data = await res.json();
    setLines(data.lines ?? []);
  };

  useEffect(() => { load(); loadLines(); }, [lineIdFilter, statusFilter]);

  const filtered = spools.filter(s =>
    s.spoolId.toLowerCase().includes(search.toLowerCase()) ||
    (s.rfidTag1 ?? '').includes(search) ||
    (s.barcode ?? '').includes(search) ||
    (s.line?.lineNumber ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleRfidLookup = async () => {
    if (!rfidScan) return;
    const res = await fetch(`/api/pipe-spool/spools?rfid=${rfidScan}`);
    const data = await res.json();
    if (data.spool) setScanResult(data.spool);
    else setScanResult(null);
  };

  const handleSave = async () => {
    if (!editing.spoolId || !editing.lineId) { setError('Spool ID and Line are required.'); return; }
    setSaving(true); setError('');
    const payload: any = { ...editing };
    if (payload.weight) payload.weight = parseFloat(payload.weight);
    const res = await fetch('/api/pipe-spool/spools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setEditing({ ...EMPTY_SPOOL, lineId: lineIdFilter ?? '' });
    load();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch('/api/pipe-spool/spools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', id, status: newStatus }),
    });
    load();
  };

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Spool Register</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Spool Register</h1>
        </div>
        <button onClick={() => { setEditing({ ...EMPTY_SPOOL, lineId: lineIdFilter ?? '' }); setShowForm(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> New Spool
        </button>
      </div>

      {/* RFID Scan Lookup */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Tag size={16} color="#8b5cf6" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>RFID / Barcode Scan:</span>
        <input
          value={rfidScan} onChange={e => setRfidScan(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRfidLookup()}
          placeholder="Scan or type RFID tag / barcode…"
          style={{ flex: 1, maxWidth: 320, padding: '7px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}
        />
        <button onClick={handleRfidLookup} style={{ padding: '7px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Lookup</button>
        {scanResult && (
          <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>
            Found: <Link href={`/pipe-spool/spools?id=${scanResult.id}`} style={{ color: '#10b981' }}>{scanResult.spoolId}</Link>
            {' '}— {scanResult.status.replace('_', ' ')}
          </div>
        )}
        {rfidScan && !scanResult && <span style={{ fontSize: 13, color: '#ef4444' }}>Not found</span>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search spool ID, RFID, barcode…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Statuses</option>
          {SPOOL_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
        </select>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)', alignSelf: 'center' }}>{filtered.length} spools</span>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 580, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>{editing.id ? 'Edit Spool' : 'New Spool'}</h3>
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
                { key: 'spoolId', label: 'Spool ID *', placeholder: 'e.g. SPOOL-001' },
                { key: 'rfidTag1', label: 'RFID Tag 1', placeholder: 'Primary RFID' },
                { key: 'rfidTag2', label: 'RFID Tag 2', placeholder: 'Secondary RFID' },
                { key: 'barcode', label: 'Barcode / QR', placeholder: 'Barcode value' },
                { key: 'weight', label: 'Weight (kg)', placeholder: '0.0' },
                { key: 'material', label: 'Material', placeholder: 'e.g. CS A106 Gr.B' },
                { key: 'size', label: 'Size', placeholder: 'e.g. 6"-SCH40' },
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
                  {SPOOL_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Saving…' : 'Save Spool'}</button>
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
            {search ? 'No spools match your search.' : 'No spools yet. Click "New Spool" to add one.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Spool ID', 'Line', 'RFID / Barcode', 'Size / Material', 'Storage Location', 'Joints', 'Flow', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(spool => {
                const storageAddr = [spool.storageZone, spool.storageRack, spool.storageRow, spool.storagePosition].filter(Boolean).join('-');
                return (
                  <tr key={spool.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <Link href={`/pipe-spool/spools/${spool.id}`} style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 700 }}>
                          {spool.spoolId}
                        </Link>
                        <Link href={`/pipe-spool/spools/${spool.id}`} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.7rem' }}>
                          View Passport →
                        </Link>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>{spool.line?.lineNumber ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 12 }}>
                        {spool.rfidTag1 && <div style={{ color: '#8b5cf6' }}><Tag size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />{spool.rfidTag1}</div>}
                        {spool.barcode && <div style={{ color: 'var(--muted-foreground)' }}>{spool.barcode}</div>}
                        {!spool.rfidTag1 && !spool.barcode && '—'}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>{[spool.size, spool.material].filter(Boolean).join(' / ') || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {storageAddr ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <MapPin size={11} color="#f97316" />{storageAddr}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <Link href={`/pipe-spool/joints?spoolId=${spool.id}`} style={{ color: '#f59e0b', textDecoration: 'none', fontWeight: 600 }}>
                        {spool._count?.joints ?? 0}
                      </Link>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <FlowTracker status={spool.status} />
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <select value={spool.status} onChange={e => handleStatusChange(spool.id, e.target.value)}
                        style={{
                          padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                          background: (SPOOL_STATUS_COLORS[spool.status] ?? '#64748b') + '22',
                          color: SPOOL_STATUS_COLORS[spool.status] ?? '#64748b',
                          border: 'none', cursor: 'pointer', outline: 'none',
                        }}>
                        {SPOOL_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <button onClick={() => { setEditing(spool); setShowForm(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b5cf6', fontSize: 12 }}>
                        Edit
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

export default function SpoolsPage() {
  return (
    <Suspense>
      <SpoolsContent />
    </Suspense>
  );
}
