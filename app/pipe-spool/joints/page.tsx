'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, ChevronRight, Tag, AlertTriangle, Wrench } from 'lucide-react';
import Link from 'next/link';
import { JOINT_STATUSES, JOINT_STATUS_COLORS, formatStatus } from '@/lib/spoolStatus';

interface Joint {
  id: string;
  jointId: string;
  spoolId: string;
  jointType: string;
  status: string;
  holdFlag: boolean;
  holdReason?: string;
  rfidTag1?: string;
  rfidTag2?: string;
  barcode?: string;
  nominalSize?: string;
  wallThickness?: string;
  material?: string;
  weldingProcess?: string;
  spool?: { spoolId: string };
  _count?: { weldRecords: number; ndeRecords: number; ncrs: number };
}

const JOINT_TYPES = ['FIELD_WELD', 'BOLT_UP', 'FLANGE', 'SOCKET_WELD', 'THREADED'];

function JointsContent() {
  const searchParams = useSearchParams();
  const spoolIdFilter = searchParams.get('spoolId');

  const [joints, setJoints] = useState<Joint[]>([]);
  const [spools, setSpools] = useState<{ id: string; spoolId: string }[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>({ jointId: '', spoolId: spoolIdFilter ?? '', jointType: 'FIELD_WELD', status: 'PENDING', holdFlag: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rfidScan, setRfidScan] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [pairRfid1, setPairRfid1] = useState('');
  const [pairRfid2, setPairRfid2] = useState('');
  const [pairResult, setPairResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (spoolIdFilter) params.set('spoolId', spoolIdFilter);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/pipe-spool/joints?${params}`);
    const data = await res.json();
    setJoints(data.joints ?? []);
    setLoading(false);
  };

  const loadSpools = async () => {
    const res = await fetch('/api/pipe-spool/spools');
    const data = await res.json();
    setSpools(data.spools ?? []);
  };

  useEffect(() => { load(); loadSpools(); }, [spoolIdFilter, statusFilter]);

  const filtered = joints.filter(j =>
    j.jointId.toLowerCase().includes(search.toLowerCase()) ||
    (j.rfidTag1 ?? '').includes(search) ||
    (j.spool?.spoolId ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleRfidLookup = async () => {
    if (!rfidScan) return;
    const res = await fetch(`/api/pipe-spool/joints?rfid=${rfidScan}`);
    const data = await res.json();
    setScanResult(data.joint ?? null);
  };

  const handleVerifyPair = async () => {
    if (!pairRfid1 || !pairRfid2) return;
    const res = await fetch('/api/pipe-spool/joints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_pair', rfid1: pairRfid1, rfid2: pairRfid2 }),
    });
    const data = await res.json();
    setPairResult(data);
  };

  const handleSave = async () => {
    if (!editing.jointId || !editing.spoolId) { setError('Joint ID and Spool are required.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/pipe-spool/joints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setEditing({ jointId: '', spoolId: spoolIdFilter ?? '', jointType: 'FIELD_WELD', status: 'PENDING', holdFlag: false });
    load();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch('/api/pipe-spool/joints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', id, status }),
    });
    load();
  };

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Joints &amp; Welds</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Joints &amp; Welds</h1>
        </div>
        <button onClick={() => { setEditing({ jointId: '', spoolId: spoolIdFilter ?? '', jointType: 'FIELD_WELD', status: 'PENDING', holdFlag: false }); setShowForm(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
          background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8,
          cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          <Plus size={15} /> New Joint
        </button>
      </div>

      {/* RFID Tools */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Single lookup */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 8 }}>RFID Single Lookup</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={rfidScan} onChange={e => setRfidScan(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRfidLookup()}
              placeholder="Scan RFID tag…"
              style={{ flex: 1, padding: '7px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
            <button onClick={handleRfidLookup} style={{ padding: '7px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Find</button>
          </div>
          {scanResult && <div style={{ marginTop: 8, fontSize: 12, color: '#10b981', fontWeight: 600 }}>✓ {scanResult.jointId} — {scanResult.spool?.spoolId} — {scanResult.status}</div>}
        </div>
        {/* Pair verify */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 8 }}>Verify RFID Pair (both tags = same joint)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={pairRfid1} onChange={e => setPairRfid1(e.target.value)} placeholder="Tag 1…"
              style={{ flex: 1, padding: '7px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
            <input value={pairRfid2} onChange={e => setPairRfid2(e.target.value)} placeholder="Tag 2…"
              style={{ flex: 1, padding: '7px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
            <button onClick={handleVerifyPair} style={{ padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Verify</button>
          </div>
          {pairResult !== null && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: pairResult.verified ? '#10b981' : '#ef4444' }}>
              {pairResult.verified ? `✓ Matched: ${pairResult.joint?.jointId}` : '✗ Tags do not match any joint'}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search joint ID, RFID, spool…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '9px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
          <option value="">All Statuses</option>
          {JOINT_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
        </select>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)', alignSelf: 'center' }}>{filtered.length} joints</span>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17 }}>{editing.id ? 'Edit Joint' : 'New Joint'}</h3>
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
              {[
                { key: 'jointId', label: 'Joint ID *', placeholder: 'e.g. SPOOL-001-J01' },
                { key: 'rfidTag1', label: 'RFID Tag 1', placeholder: 'Primary RFID' },
                { key: 'rfidTag2', label: 'RFID Tag 2', placeholder: 'Secondary RFID' },
                { key: 'barcode', label: 'Barcode', placeholder: 'Barcode value' },
                { key: 'nominalSize', label: 'Nominal Size', placeholder: 'e.g. 6"' },
                { key: 'wallThickness', label: 'Wall Thickness', placeholder: 'e.g. SCH40' },
                { key: 'material', label: 'Material', placeholder: 'e.g. CS A106' },
                { key: 'weldingProcess', label: 'Welding Process', placeholder: 'e.g. SMAW, GTAW' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{f.label}</label>
                  <input value={editing[f.key] ?? ''} onChange={e => setEditing((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Joint Type</label>
                <select value={editing.jointType} onChange={e => setEditing((p: any) => ({ ...p, jointType: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {JOINT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>Status</label>
                <select value={editing.status} onChange={e => setEditing((p: any) => ({ ...p, status: e.target.value }))}
                  style={{ padding: '8px 10px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, fontSize: 13, color: 'var(--foreground)', outline: 'none' }}>
                  {JOINT_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1/-1' }}>
                <input type="checkbox" id="holdFlag" checked={editing.holdFlag ?? false} onChange={e => setEditing((p: any) => ({ ...p, holdFlag: e.target.checked }))} />
                <label htmlFor="holdFlag" style={{ fontSize: 13 }}>Place on HOLD</label>
                {editing.holdFlag && (
                  <input value={editing.holdReason ?? ''} onChange={e => setEditing((p: any) => ({ ...p, holdReason: e.target.value }))}
                    placeholder="Hold reason…" style={{ flex: 1, padding: '6px 10px', background: 'var(--surface-muted)', border: '1px solid #f59e0b', borderRadius: 7, fontSize: 12, color: 'var(--foreground)', outline: 'none' }} />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ padding: '8px 18px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{saving ? 'Saving…' : 'Save Joint'}</button>
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
            {search ? 'No joints match.' : 'No joints yet.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>
                {['Joint ID', 'Spool', 'Type', 'RFID', 'Size', 'Welds', 'NDE', 'NCRs', 'Status', 'Hold'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => (
                <tr key={j.id} style={{ borderTop: '1px solid var(--border)', background: j.holdFlag ? '#f59e0b08' : 'transparent' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{j.jointId}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--muted-foreground)' }}>
                    <Link href={`/pipe-spool/spools?id=${j.spoolId}`} style={{ color: '#8b5cf6', textDecoration: 'none' }}>{j.spool?.spoolId}</Link>
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--muted-foreground)' }}>{j.jointType.replace('_', ' ')}</td>
                  <td style={{ padding: '11px 14px', fontSize: 11 }}>
                    {j.rfidTag1 ? <span style={{ color: '#8b5cf6' }}><Tag size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />{j.rfidTag1}</span> : '—'}
                  </td>
                  <td style={{ padding: '11px 14px' }}>{j.nominalSize ?? '—'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <Link href={`/pipe-spool/joints?jointId=${j.id}#welds`} style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                      <Wrench size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{j._count?.weldRecords ?? 0}
                    </Link>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Link href={`/pipe-spool/nde?jointId=${j.id}`} style={{ color: '#06b6d4', textDecoration: 'none', fontWeight: 600 }}>{j._count?.ndeRecords ?? 0}</Link>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {(j._count?.ncrs ?? 0) > 0
                      ? <Link href={`/pipe-spool/ncr?jointId=${j.id}`} style={{ color: '#ef4444', textDecoration: 'none', fontWeight: 600 }}>{j._count?.ncrs}</Link>
                      : <span style={{ color: 'var(--muted-foreground)' }}>0</span>}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <select value={j.status} onChange={e => handleStatusChange(j.id, e.target.value)}
                      style={{ padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: (JOINT_STATUS_COLORS[j.status] ?? '#64748b') + '22', color: JOINT_STATUS_COLORS[j.status] ?? '#64748b', border: 'none', cursor: 'pointer', outline: 'none' }}>
                      {JOINT_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {j.holdFlag && <span title={j.holdReason ?? 'On hold'}><AlertTriangle size={14} color="#f59e0b" /></span>}
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

export default function JointsPage() {
  return <Suspense><JointsContent /></Suspense>;
}
