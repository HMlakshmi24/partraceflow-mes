'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, Tag, MapPin, AlertTriangle } from 'lucide-react';
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

// Human-readable status labels for factory floor workers
const STATUS_LABELS: Record<string, string> = {
  FABRICATING:     'Being Made',
  RECEIVED:        'Received',
  IN_STORAGE:      'In Yard',
  ISSUED:          'Issued',
  FIT_UP:          'Fit-Up',
  WELDED:          'Welding Done',
  NDE_PENDING:     'Weld Test Pending',
  NDE_CLEAR:       'Weld Test Passed',
  PRESSURE_TESTED: 'Pressure Tested',
  COMPLETE:        'Complete',
  HOLD:            'On HOLD',
  REPAIR:          'Under Repair',
};

// Filter tab definitions
const STATUS_TABS = [
  { key: '',               label: 'All Spools' },
  { key: 'FABRICATING',   label: 'Being Made' },
  { key: 'IN_STORAGE',    label: 'In Yard' },
  { key: 'ISSUED',        label: 'Issued' },
  { key: 'FIT_UP',        label: 'Fit-Up / Welding' },
  { key: 'NDE_PENDING',   label: 'Weld Testing' },
  { key: 'COMPLETE',      label: 'Complete' },
  { key: 'HOLD',          label: 'On HOLD' },
];

// ── Flow Tracker bar ──────────────────────────────────────────────────────────

function FlowTracker({ status }: { status: string }) {
  const idx = getSpoolFlowStepIndex(status);
  const isHold = status === 'HOLD';
  const isRepair = status === 'REPAIR';

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
      {SPOOL_FLOW_STEPS.map((step, i) => {
        const active = idx === i;
        const done = idx !== null && i < idx;
        const color = active ? '#0ea5e9' : done ? '#10b981' : 'var(--muted-foreground)';
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 99,
              background: color,
              boxShadow: active ? `0 0 0 3px ${color}30` : 'none',
            }} />
            <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, color, whiteSpace: 'nowrap' as const }}>
              {step.label}
            </span>
            {i < SPOOL_FLOW_STEPS.length - 1 && (
              <span style={{ fontSize: 10, color: done ? '#10b981' : '#cbd5e1' }}>→</span>
            )}
          </div>
        );
      })}
      {isHold && (
        <span style={{ marginLeft: 4, padding: '2px 8px', borderRadius: 99, background: '#ef444425', color: '#ef4444', fontSize: 10, fontWeight: 800 }}>
          HOLD
        </span>
      )}
      {isRepair && (
        <span style={{ marginLeft: 4, padding: '2px 8px', borderRadius: 99, background: '#f9731625', color: '#f97316', fontSize: 10, fontWeight: 800 }}>
          REPAIR
        </span>
      )}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = SPOOL_STATUS_COLORS[status] ?? '#64748b';
  const label = STATUS_LABELS[status] ?? formatStatus(status);
  const isHold = status === 'HOLD';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 999,
      background: color + (isHold ? '28' : '18'),
      color,
      fontSize: 12, fontWeight: 800,
      border: isHold ? `1.5px solid ${color}60` : `1px solid ${color}30`,
      whiteSpace: 'nowrap' as const,
    }}>
      {isHold && <AlertTriangle size={11} />}
      {!isHold && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />}
      {label}
    </span>
  );
}

// ── Main Content ──────────────────────────────────────────────────────────────

function SpoolsContent() {
  const searchParams = useSearchParams();
  const lineIdFilter = searchParams.get('lineId');

  const [spools, setSpools] = useState<Spool[]>([]);
  const [lines, setLines] = useState<{ id: string; lineNumber: string }[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
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

  const holdCount = spools.filter(s => s.status === 'HOLD').length;
  const completeCount = spools.filter(s => s.status === 'COMPLETE').length;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 6 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Spool Register</span>
          </div>
          <h1 className="page-title">
            Spool Register
            <span style={{
              marginLeft: 12, fontSize: 16, fontWeight: 700, padding: '3px 12px', borderRadius: 999,
              background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', verticalAlign: 'middle',
            }}>
              {spools.length}
            </span>
          </h1>
          <p className="page-subtitle">
            Search, filter and update every spool in the system
            {holdCount > 0 && (
              <span style={{ marginLeft: 10, color: '#ef4444', fontWeight: 700 }}>
                · {holdCount} spool{holdCount > 1 ? 's' : ''} on HOLD
              </span>
            )}
          </p>
        </div>

        {/* Add New Spool button */}
        <button
          onClick={() => { setEditing({ ...EMPTY_SPOOL, lineId: lineIdFilter ?? '' }); setShowForm(true); }}
          className="btn-action"
          style={{ background: '#8b5cf6', color: '#fff', minHeight: 48 }}
        >
          <Plus size={18} /> Add New Spool
        </button>
      </div>

      {/* ── Quick Stats ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: spools.length, color: '#64748b' },
          { label: 'Complete', value: completeCount, color: '#10b981' },
          { label: 'On Hold', value: holdCount, color: '#ef4444' },
          { label: 'Showing', value: filtered.length, color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '8px 18px', borderRadius: 10,
            background: s.color + '12', border: `1px solid ${s.color}30`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)', fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── RFID / Barcode Scan ───────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <Tag size={18} color="#8b5cf6" />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
          RFID / Barcode Scan:
        </span>
        <input
          value={rfidScan}
          onChange={e => setRfidScan(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRfidLookup()}
          placeholder="Scan or type RFID tag / barcode number…"
          style={{
            flex: 1, maxWidth: 380, padding: '10px 14px',
            background: 'var(--surface-muted)', border: '1px solid var(--card-border)',
            borderRadius: 8, fontSize: 14, color: 'var(--foreground)', outline: 'none',
            minHeight: 44,
          }}
        />
        <button
          onClick={handleRfidLookup}
          style={{
            minHeight: 44, padding: '0 20px',
            background: '#8b5cf6', color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700,
          }}
        >
          Look Up
        </button>
        {scanResult && (
          <div style={{ fontSize: 14, color: '#10b981', fontWeight: 700 }}>
            Found: <Link href={`/pipe-spool/spools/${scanResult.id}`} style={{ color: '#10b981' }}>{scanResult.spoolId}</Link>
            {' '}— <StatusBadge status={scanResult.status} />
          </div>
        )}
        {rfidScan && !scanResult && (
          <span style={{ fontSize: 14, color: '#ef4444', fontWeight: 600 }}>Not found — check the tag or barcode number</span>
        )}
      </div>

      {/* ── Search + Status Filter Tabs ───────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        {/* Search bar */}
        <div style={{ position: 'relative', maxWidth: 480, marginBottom: 14 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Spool ID, RFID tag, barcode or line number…"
            style={{
              width: '100%', padding: '12px 14px 12px 42px',
              background: 'var(--card-bg)', border: '1.5px solid var(--card-border)',
              borderRadius: 10, fontSize: 14, color: 'var(--foreground)', outline: 'none',
              minHeight: 48, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Status filter pill tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_TABS.map(tab => {
            const active = statusFilter === tab.key;
            const tabColor = tab.key ? (SPOOL_STATUS_COLORS[tab.key] ?? '#64748b') : '#3b82f6';
            const count = tab.key === '' ? spools.length : spools.filter(s => s.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  minHeight: 40, padding: '0 16px',
                  borderRadius: 999, border: active ? `2px solid ${tabColor}` : '1.5px solid var(--card-border)',
                  background: active ? tabColor + '20' : 'var(--card-bg)',
                  color: active ? tabColor : 'var(--muted-foreground)',
                  fontWeight: active ? 800 : 600, fontSize: 13,
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 999,
                  background: active ? tabColor + '30' : 'var(--surface-muted)',
                  color: active ? tabColor : 'var(--muted-foreground)',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── New Spool Modal ───────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 18, padding: 32, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>
              {editing.id ? 'Edit Spool Details' : 'Add New Spool'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Fill in the details for this spool. Fields marked * are required.
            </p>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', padding: '10px 14px', borderRadius: 9, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Line selector — spans full width */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: '1/-1' }}>
                <label style={{ fontSize: 13, color: 'var(--foreground)', fontWeight: 700 }}>Pipe Line *</label>
                <select
                  value={editing.lineId}
                  onChange={e => setEditing((p: any) => ({ ...p, lineId: e.target.value }))}
                  style={{ padding: '10px 12px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, color: 'var(--foreground)', outline: 'none', minHeight: 44 }}
                >
                  <option value="">Select a pipe line…</option>
                  {lines.map(l => <option key={l.id} value={l.id}>{l.lineNumber}</option>)}
                </select>
              </div>

              {[
                { key: 'spoolId',  label: 'Spool ID *',    placeholder: 'e.g. SPOOL-001' },
                { key: 'rfidTag1', label: 'RFID Tag 1',    placeholder: 'Primary RFID tag' },
                { key: 'rfidTag2', label: 'RFID Tag 2',    placeholder: 'Backup RFID tag' },
                { key: 'barcode',  label: 'Barcode / QR',  placeholder: 'Barcode value' },
                { key: 'weight',   label: 'Weight (kg)',    placeholder: '0.0' },
                { key: 'material', label: 'Material',       placeholder: 'e.g. CS A106 Gr.B' },
                { key: 'size',     label: 'Size',           placeholder: 'e.g. 6"-SCH40' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 13, color: 'var(--foreground)', fontWeight: 700 }}>{f.label}</label>
                  <input
                    value={editing[f.key] ?? ''}
                    onChange={e => setEditing((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ padding: '10px 12px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, color: 'var(--foreground)', outline: 'none', minHeight: 44 }}
                  />
                </div>
              ))}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 13, color: 'var(--foreground)', fontWeight: 700 }}>Initial Status</label>
                <select
                  value={editing.status}
                  onChange={e => setEditing((p: any) => ({ ...p, status: e.target.value }))}
                  style={{ padding: '10px 12px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, color: 'var(--foreground)', outline: 'none', minHeight: 44 }}
                >
                  {SPOOL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? formatStatus(s)}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowForm(false); setError(''); }}
                style={{ padding: '10px 22px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '10px 24px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 9, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, minHeight: 44, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving…' : 'Save Spool'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Spool Table ───────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 15, fontWeight: 600 }}>
            Loading spools…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
              {search ? 'No spools match your search.' : statusFilter ? `No spools with status "${STATUS_LABELS[statusFilter] ?? statusFilter}".` : 'No spools added yet.'}
            </p>
            <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
              {!search && !statusFilter && 'Click "Add New Spool" above to get started.'}
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {['Spool ID', 'Line', 'RFID / Barcode', 'Size / Material', 'Location', 'Joints', 'Flow Progress', 'Status', 'Actions'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(spool => {
                const storageAddr = [spool.storageZone, spool.storageRack, spool.storageRow, spool.storagePosition].filter(Boolean).join('-');
                return (
                  <tr key={spool.id} style={{ borderTop: '1px solid var(--border)' }}>

                    {/* Spool ID */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Link href={`/pipe-spool/spools/${spool.id}`} style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 800, fontSize: 14 }}>
                          {spool.spoolId}
                        </Link>
                        <Link href={`/pipe-spool/spools/${spool.id}`} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>
                          View Passport →
                        </Link>
                      </div>
                    </td>

                    {/* Line */}
                    <td style={{ color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 13 }}>
                      {spool.line?.lineNumber ?? '—'}
                    </td>

                    {/* RFID / Barcode */}
                    <td>
                      <div style={{ fontSize: 12 }}>
                        {spool.rfidTag1 && (
                          <div style={{ color: '#8b5cf6', fontWeight: 600 }}>
                            <Tag size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            {spool.rfidTag1}
                          </div>
                        )}
                        {spool.barcode && (
                          <div style={{ color: 'var(--muted-foreground)' }}>{spool.barcode}</div>
                        )}
                        {!spool.rfidTag1 && !spool.barcode && (
                          <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                        )}
                      </div>
                    </td>

                    {/* Size / Material */}
                    <td style={{ fontSize: 13, color: 'var(--foreground)' }}>
                      {[spool.size, spool.material].filter(Boolean).join(' / ') || '—'}
                    </td>

                    {/* Storage Location */}
                    <td>
                      {storageAddr ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                          <MapPin size={11} color="#f97316" />
                          {storageAddr}
                        </span>
                      ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </td>

                    {/* Joints count */}
                    <td>
                      <Link href={`/pipe-spool/joints?spoolId=${spool.id}`} style={{
                        color: '#f59e0b', textDecoration: 'none', fontWeight: 800, fontSize: 16,
                      }}>
                        {spool._count?.joints ?? 0}
                      </Link>
                    </td>

                    {/* Flow tracker */}
                    <td style={{ minWidth: 260 }}>
                      <FlowTracker status={spool.status} />
                    </td>

                    {/* Status badge + quick-change select */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <StatusBadge status={spool.status} />
                        <select
                          value={spool.status}
                          onChange={e => handleStatusChange(spool.id, e.target.value)}
                          style={{
                            padding: '4px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                            background: 'var(--surface-muted)',
                            color: 'var(--muted-foreground)',
                            border: '1px solid var(--card-border)',
                            cursor: 'pointer', outline: 'none',
                          }}
                        >
                          {SPOOL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? formatStatus(s)}</option>)}
                        </select>
                      </div>
                    </td>

                    {/* Edit */}
                    <td>
                      <button
                        onClick={() => { setEditing(spool); setShowForm(true); }}
                        style={{
                          background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
                          borderRadius: 7, cursor: 'pointer', color: '#8b5cf6',
                          fontSize: 13, fontWeight: 700, padding: '6px 14px', minHeight: 36,
                        }}
                      >
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
