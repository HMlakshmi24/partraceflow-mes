'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Wifi, WifiOff,
  Tag, Package, GitBranch, Clock, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { JOINT_STATUS_COLORS, SPOOL_STATUS_COLORS, formatStatus } from '@/lib/spoolStatus';

// ── types ──────────────────────────────────────────────────────────────────────

interface ScannedJoint {
  id: string;
  jointId: string;
  jointType: string;
  status: string;
  holdFlag: boolean;
  holdReason?: string;
  nominalSize?: string;
  material?: string;
  spool?: { id: string; spoolId: string; status: string };
}

interface ScannedSpool {
  id: string;
  spoolId: string;
  status: string;
  storageZone?: string;
  storageRack?: string;
  storageRow?: string;
  storagePosition?: string;
  line?: { lineNumber: string; area: string };
}

type ScanResult = { type: 'joint'; data: ScannedJoint } | { type: 'spool'; data: ScannedSpool } | null;

interface CachedScan { rfid: string; result: ScanResult; timestamp: number; }

// ── constants ──────────────────────────────────────────────────────────────────

const JOINT_STATUS_FLOW: Record<string, { next: string; action: string; color: string }> = {
  PENDING:     { next: 'FIT_UP',      action: 'Approve Fit-Up',   color: '#3b82f6' },
  FIT_UP:      { next: 'WELDED',      action: 'Approve Weld',     color: '#f59e0b' },
  WELDED:      { next: 'NDE_PENDING', action: 'Submit to NDE',    color: '#8b5cf6' },
  NDE_PENDING: { next: 'NDE_CLEAR',   action: 'Clear NDE',        color: '#06b6d4' },
  REPAIR:      { next: 'NDE_PENDING', action: 'Re-submit NDE',    color: '#f97316' },
  NDE_CLEAR:   { next: 'COMPLETE',    action: 'Mark Complete',    color: '#10b981' },
};

const STATUS_COLORS: Record<string, string> = { ...SPOOL_STATUS_COLORS, ...JOINT_STATUS_COLORS };

const DEFECT_OPTIONS = [
  'Porosity', 'Incomplete Fusion', 'Undercut', 'Cracks', 'Misalignment',
  'Slag Inclusion', 'Burn Through', 'Dimensional Non-conformance', 'Surface Defect', 'Other',
];

const CACHE_KEY = 'pipe-spool-scan-cache';
const MAX_CACHE = 30;

// ── helpers ────────────────────────────────────────────────────────────────────

function readCache(): CachedScan[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]'); }
  catch { return []; }
}

function writeCache(scans: CachedScan[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(scans.slice(0, MAX_CACHE)));
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? '#64748b';
  return (
    <span style={{
      padding: '6px 16px', borderRadius: 99, fontSize: 14, fontWeight: 700,
      background: c + '22', color: c, border: `1px solid ${c}44`,
    }}>
      {formatStatus(status)}
    </span>
  );
}

function BigButton({ label, color, onClick, disabled, icon: Icon }: {
  label: string; color: string; onClick: () => void; disabled?: boolean; icon?: any;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minHeight: 72, fontSize: 18, fontWeight: 700,
        background: disabled ? '#2a2a2a' : color,
        color: disabled ? '#666' : '#fff',
        border: 'none', borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        transition: 'opacity 0.15s', opacity: disabled ? 0.5 : 1,
        boxShadow: disabled ? 'none' : `0 4px 16px ${color}44`,
      }}
    >
      {Icon && <Icon size={22} />}
      {label}
    </button>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function MobileScanPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rfid, setRfid] = useState('');
  const [rfid2, setRfid2] = useState('');
  const [scanMode, setScanMode] = useState<'single' | 'pair'>('single');
  const [result, setResult] = useState<ScanResult>(null);
  const [pairVerified, setPairVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDefects, setShowDefects] = useState(false);
  const [selectedDefects, setSelectedDefects] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null);
  const [history, setHistory] = useState<CachedScan[]>([]);
  const [tab, setTab] = useState<'scan' | 'history'>('scan');

  useEffect(() => {
    setHistory(readCache());
    const up = () => setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', up);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', up); };
  }, []);

  useEffect(() => {
    if (tab === 'scan') setTimeout(() => inputRef.current?.focus(), 100);
  }, [tab, result]);

  const scan = async (tag: string) => {
    if (!tag.trim()) return;
    setLoading(true);
    setActionMsg(null);
    setPairVerified(null);

    if (!online) {
      const cache = readCache();
      const hit = cache.find(c => c.rfid === tag);
      setResult(hit?.result ?? null);
      setLoading(false);
      return;
    }

    try {
      // Try joint first, then spool
      const [jRes, sRes] = await Promise.all([
        fetch(`/api/pipe-spool/joints?rfid=${encodeURIComponent(tag)}`),
        fetch(`/api/pipe-spool/spools?rfid=${encodeURIComponent(tag)}`),
      ]);
      const [jData, sData] = await Promise.all([jRes.json(), sRes.json()]);

      let found: ScanResult = null;
      if (jData.joint) found = { type: 'joint', data: jData.joint };
      else if (sData.spool) found = { type: 'spool', data: sData.spool };

      setResult(found);

      // Cache result
      const cache = readCache().filter(c => c.rfid !== tag);
      cache.unshift({ rfid: tag, result: found, timestamp: Date.now() });
      writeCache(cache);
      setHistory(readCache());
    } catch {
      // Fallback to cache on network error
      const cache = readCache();
      const hit = cache.find(c => c.rfid === tag);
      setResult(hit?.result ?? null);
    }
    setLoading(false);
  };

  const verifyPair = async () => {
    if (!rfid || !rfid2) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pipe-spool/joints', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_pair', rfid1: rfid, rfid2 }),
      });
      const data = await res.json();
      setPairVerified(data.verified);
      if (data.joint) setResult({ type: 'joint', data: data.joint });
    } catch { setPairVerified(false); }
    setLoading(false);
  };

  const doAction = async (action: 'approve' | 'reject', newStatus?: string) => {
    if (result?.type !== 'joint') return;
    const joint = result.data;

    if (action === 'reject' && !rejectReason && selectedDefects.length === 0) {
      setShowDefects(true);
      setPendingAction('reject');
      return;
    }

    setLoading(true);
    try {
      const remarks = selectedDefects.length > 0
        ? selectedDefects.join(', ') + (rejectReason ? ` — ${rejectReason}` : '')
        : rejectReason;

      const nextStatus = action === 'approve'
        ? (newStatus ?? JOINT_STATUS_FLOW[joint.status]?.next)
        : 'HOLD';
      if (!nextStatus) {
        setActionMsg({ ok: false, text: 'No valid next status for this joint' });
        setLoading(false);
        return;
      }

      await fetch('/api/pipe-spool/joints', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status', id: joint.id,
          status: nextStatus,
          holdFlag: action === 'reject',
          holdReason: action === 'reject' ? remarks : undefined,
        }),
      });

      setActionMsg({
        ok: action === 'approve',
        text: action === 'approve'
          ? `✓ ${JOINT_STATUS_FLOW[joint.status]?.action ?? 'Updated'}`
          : `⚠ Hold placed — ${remarks || 'No reason'}`,
      });
      setShowDefects(false);
      setSelectedDefects([]);
      setRejectReason('');
      setPendingAction(null);
      // Refresh
      await scan(rfid);
    } catch { setActionMsg({ ok: false, text: 'Network error — action not saved' }); }
    setLoading(false);
  };

  const placeHold = async () => {
    if (result?.type !== 'joint') return;
    if (result.data.status === 'HOLD') {
      setActionMsg({ ok: false, text: 'Already on HOLD' });
      return;
    }
    setLoading(true);
    await fetch('/api/pipe-spool/joints', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', id: result.data.id, status: 'HOLD', holdFlag: true, holdReason: rejectReason || 'Hold placed from field scan' }),
    });
    setActionMsg({ ok: false, text: '⚠️ Hold placed — QA notified' });
    setLoading(false);
    await scan(rfid);
  };

  const reset = () => {
    setRfid(''); setRfid2(''); setResult(null); setPairVerified(null);
    setActionMsg(null); setShowDefects(false); setSelectedDefects([]); setRejectReason('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── render ────────────────────────────────────────────────────────────────────

  const bg = '#0a0f1a';
  const card = '#111827';
  const border = 'rgba(255,255,255,0.08)';

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#e2e8f0', fontFamily: 'var(--font-sans, system-ui)', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12, marginBottom: 2 }}>
            <Link href="/pipe-spool" style={{ color: '#64748b', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={12} />
            <span>Field Scan</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Field Scanner</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {online ? <Wifi size={16} color="#10b981" /> : <WifiOff size={16} color="#ef4444" />}
          <span style={{ fontSize: 11, color: online ? '#10b981' : '#ef4444' }}>{online ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${border}` }}>
        {(['scan', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '14px 0', background: 'none', border: 'none',
            color: tab === t ? '#67e8f9' : '#64748b', fontSize: 15, fontWeight: tab === t ? 700 : 400,
            cursor: 'pointer', borderBottom: tab === t ? '2px solid #67e8f9' : '2px solid transparent',
          }}>
            {t === 'scan' ? '📡 Scan' : `🕒 History (${history.length})`}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        /* History tab */
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {history.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', marginTop: 40 }}>No recent scans</p>
          ) : history.map((h, i) => (
            <div key={i} onClick={() => { setRfid(h.rfid); setResult(h.result); setTab('scan'); }}
              style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#67e8f9' }}>{h.rfid}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(h.timestamp).toLocaleTimeString()}</span>
              </div>
              {h.result ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {h.result.type === 'joint' ? `Joint: ${h.result.data.jointId}` : `Spool: ${(h.result.data as ScannedSpool).spoolId}`}
                  {' — '}<StatusBadge status={h.result.data.status} />
                </div>
              ) : <span style={{ fontSize: 12, color: '#ef4444' }}>Not found</span>}
            </div>
          ))}
        </div>
      ) : (
        /* Scan tab */
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['single', 'pair'] as const).map(m => (
              <button key={m} onClick={() => { setScanMode(m); reset(); }} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: scanMode === m ? '#1e3a5f' : card,
                color: scanMode === m ? '#67e8f9' : '#64748b',
                border: `1px solid ${scanMode === m ? '#67e8f9' : border}`,
                cursor: 'pointer',
              }}>
                {m === 'single' ? '🏷 Single Tag' : '🔗 Pair Verify'}
              </button>
            ))}
          </div>

          {/* RFID Input(s) */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {scanMode === 'pair' ? 'RFID Tag 1' : 'Scan RFID / Barcode'}
            </label>
            <input
              ref={inputRef}
              value={rfid}
              onChange={e => setRfid(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && scanMode === 'single') scan(rfid); }}
              placeholder="Scan or type tag ID…"
              autoComplete="off"
              inputMode="text"
              style={{
                width: '100%', padding: '16px 14px', fontSize: 20, fontWeight: 600,
                background: '#1a2234', border: `2px solid ${rfid ? '#67e8f9' : border}`,
                borderRadius: 12, color: '#e2e8f0', outline: 'none',
                letterSpacing: '0.05em',
              }}
            />
          </div>

          {scanMode === 'pair' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>RFID Tag 2</label>
              <input
                value={rfid2}
                onChange={e => setRfid2(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') verifyPair(); }}
                placeholder="Scan second tag…"
                autoComplete="off"
                inputMode="text"
                style={{
                  width: '100%', padding: '16px 14px', fontSize: 20, fontWeight: 600,
                  background: '#1a2234', border: `2px solid ${rfid2 ? '#3b82f6' : border}`,
                  borderRadius: 12, color: '#e2e8f0', outline: 'none', letterSpacing: '0.05em',
                }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {scanMode === 'single' ? (
              <>
                <BigButton label={loading ? 'Scanning…' : 'Scan'} color="#1e3a8a" onClick={() => scan(rfid)} disabled={loading || !rfid} icon={Tag} />
                <BigButton label="Clear" color="#374151" onClick={reset} disabled={loading} icon={RefreshCw} />
              </>
            ) : (
              <>
                <BigButton label={loading ? 'Verifying…' : 'Verify Pair'} color="#1e3a8a" onClick={verifyPair} disabled={loading || !rfid || !rfid2} icon={Tag} />
                <BigButton label="Clear" color="#374151" onClick={reset} disabled={loading} icon={RefreshCw} />
              </>
            )}
          </div>

          {/* Pair result */}
          {pairVerified !== null && scanMode === 'pair' && (
            <div style={{
              padding: '16px', borderRadius: 12, marginBottom: 16,
              background: pairVerified ? '#10b98122' : '#ef444422',
              border: `1px solid ${pairVerified ? '#10b98166' : '#ef444466'}`,
              textAlign: 'center', fontSize: 18, fontWeight: 700,
              color: pairVerified ? '#10b981' : '#ef4444',
            }}>
              {pairVerified ? '✓ Tags Verified — Same Joint' : '✗ Mismatch — Wrong Joint!'}
            </div>
          )}

          {/* Action message */}
          {actionMsg && (
            <div style={{
              padding: '14px 16px', borderRadius: 10, marginBottom: 14, fontSize: 16, fontWeight: 600,
              background: actionMsg.ok ? '#10b98122' : '#ef444422',
              border: `1px solid ${actionMsg.ok ? '#10b98166' : '#ef444466'}`,
              color: actionMsg.ok ? '#10b981' : '#ef4444',
            }}>
              {actionMsg.text}
            </div>
          )}

          {/* Scan Result Card */}
          {result && !loading && (
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: '20px 18px', marginBottom: 16 }}>
              {result.type === 'spool' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <Package size={24} color="#8b5cf6" />
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>{result.data.spoolId}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{result.data.line?.lineNumber ?? 'No line'} · {result.data.line?.area}</div>
                    </div>
                  </div>
                  <StatusBadge status={result.data.status} />
                  {(result.data.storageZone || result.data.storageRack) && (
                    <div style={{ marginTop: 14, fontSize: 15, color: '#f97316', fontWeight: 600 }}>
                      📍 Location: {[result.data.storageZone, result.data.storageRack, result.data.storageRow, result.data.storagePosition].filter(Boolean).join('-')}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <GitBranch size={24} color="#f59e0b" />
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>{result.data.jointId}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>
                        {result.data.spool?.spoolId ?? '—'} · {result.data.jointType.replace('_', ' ')}
                        {result.data.nominalSize && ` · ${result.data.nominalSize}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <StatusBadge status={result.data.status} />
                    {result.data.holdFlag && (
                      <span style={{ padding: '6px 14px', borderRadius: 99, fontSize: 14, fontWeight: 700, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                        ⚠️ HOLD
                      </span>
                    )}
                  </div>

                  {result.data.holdReason && (
                    <div style={{ padding: '10px 12px', background: '#f59e0b11', border: '1px solid #f59e0b44', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#f59e0b' }}>
                      Hold: {result.data.holdReason}
                    </div>
                  )}

                  {/* Primary action buttons */}
                  {JOINT_STATUS_FLOW[result.data.status] && !result.data.holdFlag && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      <BigButton
                        label={JOINT_STATUS_FLOW[result.data.status].action}
                        color={JOINT_STATUS_FLOW[result.data.status].color}
                        onClick={() => doAction('approve')}
                        disabled={loading}
                        icon={CheckCircle2}
                      />
                      <BigButton
                        label="Hold"
                        color="#ef4444"
                        onClick={() => doAction('reject')}
                        disabled={loading}
                        icon={XCircle}
                      />
                    </div>
                  )}

                  {/* Hold button */}
                  {!result.data.holdFlag && (
                    <button onClick={placeHold} disabled={loading} style={{
                      width: '100%', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 600,
                      background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44',
                      cursor: 'pointer', marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <AlertTriangle size={18} /> Place HOLD
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Not found */}
          {result === null && !loading && rfid && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444', fontSize: 16, fontWeight: 600, background: '#ef444411', borderRadius: 12, border: '1px solid #ef444444' }}>
              ✗ Tag not found in system
            </div>
          )}

          {/* Defect picker modal */}
          {showDefects && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', zIndex: 999 }}>
              <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: '#111827', borderRadius: '20px 20px 0 0', padding: '20px 16px', maxHeight: '70vh', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700 }}>Select Defect Type(s)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {DEFECT_OPTIONS.map(d => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 10, background: selectedDefects.includes(d) ? '#ef444422' : '#1a2234', border: `1px solid ${selectedDefects.includes(d) ? '#ef444466' : border}`, cursor: 'pointer', fontSize: 15 }}>
                      <input type="checkbox" checked={selectedDefects.includes(d)} onChange={e => setSelectedDefects(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))} style={{ width: 18, height: 18 }} />
                      {d}
                    </label>
                  ))}
                </div>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Additional notes…" rows={3}
                  style={{ width: '100%', padding: '10px 12px', background: '#1a2234', border: `1px solid ${border}`, borderRadius: 10, fontSize: 14, color: '#e2e8f0', outline: 'none', resize: 'none', marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowDefects(false); setPendingAction(null); }}
                    style={{ flex: 1, padding: '14px', background: '#374151', color: '#e2e8f0', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={() => doAction('reject')} disabled={selectedDefects.length === 0 && !rejectReason}
                    style={{ flex: 2, padding: '14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: (selectedDefects.length === 0 && !rejectReason) ? 0.5 : 1 }}>
                  Confirm Hold
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
