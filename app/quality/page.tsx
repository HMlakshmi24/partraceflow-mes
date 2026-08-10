'use client';

import { CheckCircle, XCircle, Camera, Save, Clipboard, TrendingUp, ChevronDown, ShieldCheck, Award, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import styles from './quality.module.css';

interface VisualChecks { surfaceFinish: boolean; colorMatch: boolean; labelAlignment: boolean; }

interface QualitySpec {
    id: string;
    parameterName: string;
    unit: string | null;
    nominalValue: number | null;
    lowerSpecLimit: number | null;
    upperSpecLimit: number | null;
}

function specStatus(spec: QualitySpec | null, val: string): 'ok' | 'fail' | 'none' {
    if (!val || !spec) return 'none';
    const n = parseFloat(val);
    if (isNaN(n)) return 'none';
    const min = spec.lowerSpecLimit ?? -Infinity;
    const max = spec.upperSpecLimit ?? Infinity;
    return n >= min && n <= max ? 'ok' : 'fail';
}

function specPlaceholder(spec: QualitySpec): string {
    const parts: string[] = [];
    if (spec.nominalValue != null) parts.push(`Nom: ${spec.nominalValue}`);
    if (spec.lowerSpecLimit != null) parts.push(`Min: ${spec.lowerSpecLimit}`);
    if (spec.upperSpecLimit != null) parts.push(`Max: ${spec.upperSpecLimit}`);
    if (spec.unit) parts.push(spec.unit);
    return parts.join(' | ') || 'Enter value';
}

// ── Supervisor Approval Panel ──────────────────────────────────────────────
// Shows orders in QC_PENDING state; SUPERVISOR/ADMIN can approve or send to REWORK.
function SupervisorApprovalPanel({ onAction }: { onAction: () => void }) {
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [approving, setApproving] = useState<string | null>(null);
    const [role, setRole] = useState('');
    const [username, setUsername] = useState('');

    useEffect(() => {
        // Get session role
        fetch('/api/session').then(r => r.json()).then(d => {
            setRole(d.role ?? '');
            setUsername(d.username ?? 'supervisor');
        }).catch(() => {});
        // Load QC_PENDING orders
        loadPending();
    }, []);

    function loadPending() {
        fetch('/api/quality')
            .then(r => r.json())
            .then(d => {
                const all: any[] = Array.isArray(d) ? d : [];
                setPendingOrders(all.filter((o: any) => o.status === 'QC_PENDING' || o.status === 'APPROVED'));
            })
            .catch(() => {});
    }

    async function handleApproval(orderId: string, newStatus: 'APPROVED' | 'REWORK', notes?: string) {
        setApproving(orderId + newStatus);
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-mes-username': username,
                    'x-mes-role': role,
                },
                body: JSON.stringify({ status: newStatus, notes: notes ?? (newStatus === 'APPROVED' ? 'Supervisor approved' : 'Supervisor rejected — rework required') }),
            });
            const data = await res.json();
            if (res.ok) {
                loadPending();
                onAction();
            } else {
                alert(data.error ?? 'Failed');
            }
        } catch {
            alert('Network error');
        } finally {
            setApproving(null);
        }
    }

    async function handleComplete(orderId: string) {
        setApproving(orderId + 'COMPLETED');
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-mes-username': username,
                    'x-mes-role': role,
                },
                body: JSON.stringify({ status: 'COMPLETED', notes: 'Order signed off and marked complete by supervisor' }),
            });
            if (res.ok) { loadPending(); onAction(); }
            else { const d = await res.json(); alert(d.error ?? 'Failed'); }
        } catch { alert('Network error'); }
        finally { setApproving(null); }
    }

    const isSupervisor = ['ADMIN', 'SUPERVISOR'].includes(role);

    if (!isSupervisor && pendingOrders.length === 0) return null;

    return (
        <div style={{ margin: '1rem 1rem 0', background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderBottom: pendingOrders.length > 0 ? '1px solid rgba(6,182,212,0.2)' : 'none' }}>
                <ShieldCheck size={18} color="#06b6d4" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#06b6d4' }}>
                    Supervisor Approval Gate — {pendingOrders.length} order{pendingOrders.length !== 1 ? 's' : ''} awaiting sign-off
                </span>
                {!isSupervisor && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b' }}>Log in as SUPERVISOR or ADMIN to approve</span>}
            </div>

            {pendingOrders.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {pendingOrders.map((order: any, i: number) => (
                        <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 1.25rem', borderTop: i > 0 ? '1px solid rgba(6,182,212,0.1)' : 'none', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--foreground)', fontFamily: 'monospace' }}>{order.orderNumber}</div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.15rem' }}>{order.product?.name ?? 'Unknown product'}</div>
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(6,182,212,0.15)', color: '#06b6d4', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>QC PENDING</span>
                            {isSupervisor ? (
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button
                                        onClick={() => handleApproval(order.id, 'APPROVED')}
                                        disabled={!!approving}
                                        style={{ padding: '0.45rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#06b6d4', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: approving ? 0.6 : 1 }}
                                    >
                                        <Award size={14} /> {approving === order.id + 'APPROVED' ? 'Approving…' : 'Approve'}
                                    </button>
                                    <button
                                        onClick={() => handleComplete(order.id)}
                                        disabled={!!approving}
                                        style={{ padding: '0.45rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: approving ? 0.6 : 1 }}
                                    >
                                        <CheckCircle size={14} /> {approving === order.id + 'COMPLETED' ? 'Completing…' : 'Approve & Complete'}
                                    </button>
                                    <button
                                        onClick={() => handleApproval(order.id, 'REWORK', 'Supervisor rejected — rework required')}
                                        disabled={!!approving}
                                        style={{ padding: '0.45rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(249,115,22,0.5)', background: 'rgba(249,115,22,0.1)', color: '#f97316', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: approving ? 0.6 : 1 }}
                                    >
                                        {approving === order.id + 'REWORK' ? 'Sending…' : 'Send to Rework'}
                                    </button>
                                </div>
                            ) : (
                                <span style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>Requires SUPERVISOR role</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function QualityGatePage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [orderId, setOrderId] = useState('');
    const [failedChecks, setFailedChecks] = useState<any[]>([]);
    const [showFailed, setShowFailed] = useState(false);
    const [inspector, setInspector] = useState('');
    const [status, setStatus] = useState<'PENDING' | 'PASS' | 'FAIL' | 'REWORK'>('PENDING');
    const [notes, setNotes] = useState('');
    const [defectType, setDefect] = useState('');
    const [specs, setSpecs] = useState<QualitySpec[]>([]);
    const [measurements, setMeas] = useState<Record<string, string>>({});
    const [visuals, setVisuals] = useState<VisualChecks>({ surfaceFinish: false, colorMatch: false, labelAlignment: false });
    const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
    const [submitting, setSubmit] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; orderStatus?: string } | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [approvalKey, setApprovalKey] = useState(0); // bump to force approval panel refresh

    const selectedOrder = orders.find(o => o.id === orderId);
    const isQCAllowed = !orderId || selectedOrder?.status === 'QC_PENDING';

    function reloadOrders() {
        fetch('/api/quality')
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setOrders(data); })
            .catch(() => {});
        setApprovalKey(k => k + 1);
    }

    useEffect(() => {
        fetch('/api/session').then(r => r.json())
            .then(d => { if (d.username) setInspector(d.username); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetch('/api/quality')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) setOrders(data);
            })
            .catch(() => {});
        // Load failed QC records
        fetch('/api/quality?result=FAIL&limit=50')
            .then(r => r.json())
            .then(d => setFailedChecks(d.checks ?? []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!orderId) { setHistory([]); setSpecs([]); setMeas({}); return; }
        // Bug fix (found via audit): switching the order dropdown quickly
        // (A -> B) fired two new fetches without cancelling A's in-flight
        // ones. If A's response arrived after B's — a plausible network
        // race, not a contrived edge case — it silently overwrote B's
        // already-loaded specs/history while `orderId` still correctly
        // showed B, so the PASS/FAIL auto-suggestion and out-of-spec
        // highlighting were computed against the wrong order's spec limits.
        // `ignore` gates every setState in this effect's callbacks so only
        // the most recent order's response can ever apply.
        let ignore = false;
        fetch(`/api/quality?orderId=${orderId}`)
            .then(r => r.json())
            .then(data => { if (!ignore && Array.isArray(data)) setHistory(data); })
            .catch(() => { });
        fetch(`/api/quality?specs=${orderId}`)
            .then(r => r.json())
            .then(data => {
                if (ignore) return;
                const s: QualitySpec[] = data.specs ?? [];
                setSpecs(s);
                const init: Record<string, string> = {};
                s.forEach(sp => { init[sp.id] = ''; });
                setMeas(init);
            })
            .catch(() => { });
        return () => { ignore = true; };
    }, [orderId]);

    const autoSuggest = (): 'PASS' | 'FAIL' | null => {
        const allVisual = visuals.surfaceFinish && visuals.colorMatch && visuals.labelAlignment;
        const specResults = specs.map(sp => specStatus(sp, measurements[sp.id] ?? ''));
        if (specResults.some(r => r === 'fail')) return 'FAIL';
        if (allVisual && specs.length > 0 && specResults.every(r => r === 'ok')) return 'PASS';
        return null;
    };

    const suggestion = autoSuggest();

    const handleSubmit = async () => {
        if (!orderId) { alert('Please select a work order first.'); return; }
        if (status === 'PENDING') { alert('Please select Pass, Rework, or Scrap outcome.'); return; }
        setSubmit(true);
        try {
            const res = await fetch('/api/quality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workOrderId: orderId,
                    inspector,
                    result: status === 'FAIL' ? 'FAIL' : status,
                    notes,
                    defectType: defectType || null,
                    measurements: Object.fromEntries(specs.map(sp => [sp.parameterName, measurements[sp.id] ?? ''])),
                    visualChecks: visuals,
                })
            });
            const data = await res.json();
            if (res.ok) {
                setResult({ success: true, message: `Inspection submitted: ${status}`, orderStatus: data.orderStatus });
                reloadOrders();
                const r3 = await fetch(`/api/quality?orderId=${orderId}`);
                const d3 = await r3.json();
                if (Array.isArray(d3)) setHistory(d3);
                setStatus('PENDING'); setNotes(''); setDefect('');
                const resetMeas: Record<string, string> = {};
                specs.forEach(sp => { resetMeas[sp.id] = ''; });
                setMeas(resetMeas);
                setVisuals({ surfaceFinish: false, colorMatch: false, labelAlignment: false });
                setEvidenceFiles([]);
            } else {
                setResult({ success: false, message: data.error || 'Submission failed' });
            }
        } catch {
            setResult({ success: false, message: 'Network error' });
        } finally {
            setSubmit(false);
            setTimeout(() => setResult(null), 5000);
        }
    };

    return (
        <div className={styles.qualityControl}>
            {/* ── Supervisor Approval Gate ─────────────────────────────────── */}
            <SupervisorApprovalPanel key={approvalKey} onAction={reloadOrders} />

            {/* ── Failed Inspections History ──────────────────────────────── */}
            <div style={{ margin: '1rem 1rem 0', background: 'var(--card-bg)', border: failedChecks.length > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--card-border)', borderRadius: '12px', overflow: 'hidden' }}>
                <button
                    onClick={() => setShowFailed(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.85rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: failedChecks.length > 0 ? '#dc2626' : 'var(--muted-foreground)', fontWeight: 700, fontSize: '0.9rem' }}
                >
                    <span>⚠ Failed Inspections — {failedChecks.length} records</span>
                    <span style={{ fontSize: '0.75rem' }}>{showFailed ? '▲ Hide' : '▼ Show list'}</span>
                </button>
                {showFailed && (
                    failedChecks.length === 0 ? (
                        <div style={{ padding: '0.75rem 1.25rem', color: '#10b981', fontSize: '0.88rem', borderTop: '1px solid var(--border)' }}>No failed inspections on record.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: 'rgba(239,68,68,0.06)', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
                                    {['Parameter', 'Expected', 'Actual', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#dc2626', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {failedChecks.map((qc: any, i: number) => (
                                    <tr key={qc.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(239,68,68,0.02)' }}>
                                        <td style={{ padding: '9px 14px', color: 'var(--foreground)', fontWeight: 600 }}>{qc.parameter ?? '—'}</td>
                                        <td style={{ padding: '9px 14px', color: 'var(--muted-foreground)' }}>{qc.expected ?? '—'}</td>
                                        <td style={{ padding: '9px 14px', color: '#dc2626', fontWeight: 600 }}>{qc.actual ?? '—'}</td>
                                        <td style={{ padding: '9px 14px' }}><span style={{ background: 'rgba(239,68,68,0.15)', color: '#dc2626', padding: '2px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700 }}>FAIL</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </div>

            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <h1><CheckCircle size={32} style={{ display: 'inline', marginRight: '10px' }} /> Quality Gate - Final Inspection</h1>
                    <div className={styles.orderInfo}>
                        <span>Station QG-04</span>
                        <span className={styles.divider}>|</span>
                        <span>User: {inspector}</span>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.4rem' }}>Work Order</div>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <select
                            value={orderId}
                            onChange={e => { setOrderId(e.target.value); setStatus('PENDING'); }}
                            style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '0.5rem', padding: '0.5rem 2rem 0.5rem 0.75rem', cursor: 'pointer', appearance: 'none', minWidth: '260px' }}
                        >
                            {orders.length === 0
                                ? <option value="" style={{ color: 'var(--foreground)', background: 'var(--card-bg)' }}>— No orders available —</option>
                                : <><option value="" style={{ color: 'var(--foreground)', background: 'var(--card-bg)' }}>— Select Order —</option>
                                    {orders.map(o => (
                                        <option key={o.id} value={o.id} style={{ color: 'var(--foreground)', background: 'var(--card-bg)' }}>
                                            {o.orderNumber} · {o.product?.name ?? 'Unknown'} [{o.status}]
                                        </option>
                                    ))}</>
                            }
                        </select>
                        <ChevronDown size={16} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                </div>
            </div>

            {/* QC Gate: warn when selected order is not in QC_PENDING status */}
            {orderId && !isQCAllowed && (
                <div style={{ margin: '0.75rem 1rem 0', padding: '0.85rem 1.25rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.88rem', color: '#f59e0b', fontWeight: 600 }}>
                    <AlertTriangle size={17} style={{ flexShrink: 0 }} />
                    Order is in <strong style={{ marginLeft: 4, marginRight: 4 }}>{selectedOrder?.status ?? 'unknown'}</strong> status — QC inspection is only allowed when status is <strong style={{ marginLeft: 4 }}>QC_PENDING</strong>.
                </div>
            )}

            {/* Toast */}
            {result && (
                <div style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000, padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem', fontWeight: 600, color: '#fff',
                    background: result.success ? '#10b981' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                    {result.message}{result.orderStatus ? ` → Order: ${result.orderStatus}` : ''}
                </div>
            )}

            {/* Auto-suggest banner */}
            {suggestion && status === 'PENDING' && (
                <div style={{ background: suggestion === 'PASS' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${suggestion === 'PASS' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`, borderRadius: '0.75rem', padding: '0.75rem 1.25rem', margin: '1rem 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: suggestion === 'PASS' ? '#10b981' : '#ef4444' }}>
                    {suggestion === 'PASS' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    Auto-suggestion based on measurements: <strong>{suggestion}</strong> — confirm below.
                </div>
            )}

            {!orderId && (
                <div style={{ margin: '0 1rem', padding: '1rem 1.5rem', background: 'rgba(59,130,246,0.08)', border: '2px dashed rgba(59,130,246,0.3)', borderRadius: '0.75rem', textAlign: 'center' }}>
                    <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--foreground)', marginBottom: '0.25rem' }}>Select a Work Order to begin inspection</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Use the dropdown in the top-right corner to choose an order in QC_PENDING status.</p>
                </div>
            )}

            <div className={styles.content}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    {/* LEFT: INSPECTION FORM */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        {/* VISUAL CHECK */}
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}><Clipboard size={20} /> 1. Visual Inspection</h3>
                            <div className={styles.checklist}>
                                {([
                                    ['surfaceFinish', 'Surface finish (no scratches > 1mm)'],
                                    ['colorMatch', 'Color match (Pantone 305C)'],
                                    ['labelAlignment', 'Label alignment and clarity'],
                                ] as [keyof VisualChecks, string][]).map(([key, label]) => (
                                    <label key={key} className={styles.checklistItem} style={{ cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            className={styles.hiddenCheckbox}
                                            checked={visuals[key]}
                                            onChange={e => setVisuals(v => ({ ...v, [key]: e.target.checked }))}
                                        />
                                        <div className={styles.checkbox} style={{ background: visuals[key] ? '#10b981' : undefined, color: visuals[key] ? 'var(--card-bg)' : undefined, borderColor: visuals[key] ? '#10b981' : undefined }}>
                                            {visuals[key] ? <CheckCircle size={14} /> : 'OK'}
                                        </div>
                                        <span style={{ textDecoration: visuals[key] ? 'none' : undefined }}>{label}</span>
                                    </label>
                                ))}
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                {Object.values(visuals).filter(Boolean).length} / 3 checks passed
                            </div>
                        </div>

                        {/* MEASUREMENTS */}
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}><TrendingUp size={20} /> 2. Key Measurements</h3>
                            {specs.length === 0 ? (
                                <div style={{ color: 'var(--muted-foreground)', fontSize: '0.88rem', padding: '0.75rem', background: 'var(--surface-muted)', borderRadius: '0.5rem' }}>
                                    {orderId ? 'No inspection parameters configured for this product. Define process parameters in the SPC module.' : 'Select a work order to load inspection parameters.'}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {specs.map(sp => {
                                        const st = specStatus(sp, measurements[sp.id] ?? '');
                                        return (
                                            <div key={sp.id}>
                                                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--muted-foreground)' }}>
                                                    {sp.parameterName}{sp.unit ? ` (${sp.unit})` : ''}
                                                </label>
                                                <div style={{ position: 'relative' }}>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder={specPlaceholder(sp)}
                                                        className={styles.input}
                                                        value={measurements[sp.id] ?? ''}
                                                        onChange={e => setMeas(m => ({ ...m, [sp.id]: e.target.value }))}
                                                        style={{ borderColor: st === 'ok' ? '#10b981' : st === 'fail' ? '#ef4444' : undefined, paddingRight: '2.5rem' }}
                                                    />
                                                    {st !== 'none' && (
                                                        <span style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)' }}>
                                                            {st === 'ok' ? <CheckCircle size={16} color="#10b981" /> : <XCircle size={16} color="#ef4444" />}
                                                        </span>
                                                    )}
                                                </div>
                                                {st === 'fail' && <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>Out of specification!</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* DEFECT TYPE (shown for REWORK/FAIL) */}
                        {(status === 'REWORK' || status === 'FAIL') && (
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}><XCircle size={20} /> 3. Defect Classification</h3>
                                <select
                                    value={defectType}
                                    onChange={e => setDefect(e.target.value)}
                                    className={styles.input}
                                    style={{ width: '100%' }}
                                >
                                    <option value="">— Select defect type —</option>
                                    <option>Dimensional Out-of-Spec</option>
                                    <option>Surface Defect</option>
                                    <option>Wrong Color</option>
                                    <option>Label Missing/Incorrect</option>
                                    <option>Assembly Error</option>
                                    <option>Material Defect</option>
                                    <option>Torque Failure</option>
                                    <option>Other</option>
                                </select>
                            </div>
                        )}

                        {/* EVIDENCE CAPTURE */}
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}><Camera size={20} /> {status === 'REWORK' || status === 'FAIL' ? '4' : '3'}. Evidence Capture</h3>
                            <label style={{ border: '2px dashed var(--card-border)', borderRadius: '0.75rem', padding: evidenceFiles.length > 0 ? '1rem' : '2rem', textAlign: 'center', color: 'var(--muted-foreground)', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--surface-muted)', display: 'block' }}>
                                <input type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={e => {
                                    const files = Array.from(e.target.files ?? []);
                                    setEvidenceFiles(prev => [...prev, ...files]);
                                }} />
                                {evidenceFiles.length === 0 ? (
                                    <>
                                        <Camera size={48} style={{ margin: '0 auto', marginBottom: '1rem', opacity: 0.5 }} />
                                        <p>Click or drag photos to attach evidence</p>
                                        <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>(JPG, PNG, PDF — max 10MB each)</p>
                                    </>
                                ) : (
                                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>+ Add more files</p>
                                )}
                            </label>
                            {evidenceFiles.length > 0 && (
                                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {evidenceFiles.map((f, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.75rem', background: 'var(--surface-muted)', borderRadius: '0.4rem', fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{f.name} <span style={{ color: 'var(--muted-foreground)' }}>({(f.size / 1024).toFixed(0)} KB)</span></span>
                                            <button onClick={() => setEvidenceFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* INSPECTION HISTORY */}
                        {history.length > 0 && (
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Previous Inspections for this Order</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {history.map(h => (
                                        <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'var(--surface-muted)', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                                            <span style={{ padding: '2px 10px', borderRadius: '999px', fontWeight: 700, background: h.result === 'PASS' ? 'rgba(16,185,129,0.15)' : h.result === 'FAIL' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: h.result === 'PASS' ? '#10b981' : h.result === 'FAIL' ? '#ef4444' : '#f59e0b' }}>
                                                {h.result}
                                            </span>
                                            <span style={{ color: 'var(--muted-foreground)' }}>{new Date(h.createdAt).toLocaleString()}</span>
                                            <span style={{ color: 'var(--foreground)' }}>{h.inspector}</span>
                                            {h.notes && <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>{h.notes}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: DECISION PANEL */}
                    <div style={{ position: 'sticky', top: '2rem', height: 'fit-content' }}>
                        <div className={styles.section} style={{ borderColor: 'rgba(30,134,255,0.4)' }}>
                            <h3 className={styles.sectionTitle} style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Final Decision</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                <button
                                    onClick={() => setStatus('PASS')}
                                    className={styles.submitButton}
                                    style={{
                                        height: '80px', fontSize: '1.2rem', position: 'relative',
                                        backgroundColor: status === 'PASS' ? '#10b981' : undefined,
                                        color: status === 'PASS' ? 'var(--card-bg)' : undefined,
                                        border: status === 'PASS' ? 'none' : '2px solid var(--card-border)',
                                        background: status === 'PASS' ? '#10b981' : 'transparent',
                                    }}
                                >
                                    <CheckCircle size={28} style={{ display: 'inline', marginRight: '8px' }} /> PASS
                                    {suggestion === 'PASS' && status !== 'PASS' && (
                                        <span style={{ position: 'absolute', top: '6px', right: '10px', fontSize: '0.65rem', background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '999px' }}>Suggested</span>
                                    )}
                                </button>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <button
                                        onClick={() => setStatus('REWORK')}
                                        className={styles.resetButton}
                                        style={{ border: status === 'REWORK' ? '2px solid #f59e0b' : undefined, background: status === 'REWORK' ? 'rgba(245,158,11,0.15)' : undefined, color: status === 'REWORK' ? '#f59e0b' : undefined }}
                                    >
                                        <Clipboard size={18} style={{ display: 'inline', marginRight: '4px' }} /> REWORK
                                    </button>
                                    <button
                                        onClick={() => setStatus('FAIL')}
                                        className={styles.resetButton}
                                        style={{ border: status === 'FAIL' ? '2px solid #ef4444' : undefined, background: status === 'FAIL' ? 'rgba(239,68,68,0.15)' : undefined, color: status === 'FAIL' ? '#ef4444' : undefined }}
                                    >
                                        <XCircle size={18} style={{ display: 'inline', marginRight: '4px' }} /> SCRAP
                                        {suggestion === 'FAIL' && status !== 'FAIL' && (
                                            <span style={{ fontSize: '0.6rem', background: '#ef4444', color: '#fff', padding: '1px 5px', borderRadius: '999px', marginLeft: '4px' }}>!</span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Inspector Notes</label>
                                <textarea
                                    className={styles.textarea}
                                    placeholder="Add context for rework or scrap..."
                                    rows={3}
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />

                                {status === 'PASS' && !Object.values(visuals).every(Boolean) && (
                                    <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', color: '#ef4444', fontSize: '0.82rem', fontWeight: 600, marginTop: '0.75rem' }}>
                                        All visual checks must pass before submitting PASS. ({Object.values(visuals).filter(Boolean).length}/3 completed)
                                    </div>
                                )}

                                <button
                                    onClick={handleSubmit}
                                    className={styles.submitButton}
                                    style={{ width: '100%', marginTop: '0.75rem' }}
                                    disabled={
                                        status === 'PENDING' || submitting || !orderId || !isQCAllowed
                                        || (status === 'PASS' && !Object.values(visuals).every(Boolean))
                                    }
                                >
                                    <Save size={18} style={{ display: 'inline', marginRight: '6px' }} />
                                    {submitting ? 'Submitting...'
                                        : !orderId ? 'Select an Order'
                                        : !isQCAllowed ? 'Order not in QC_PENDING'
                                        : status === 'PENDING' ? 'Select Outcome'
                                        : (status === 'PASS' && !Object.values(visuals).every(Boolean)) ? `Complete All Checks First (${Object.values(visuals).filter(Boolean).length}/3)`
                                        : `Submit ${status}`}
                                </button>

                                {/* Result summary card */}
                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Visual checks</span>
                                        <strong style={{ color: Object.values(visuals).every(Boolean) ? '#10b981' : '#f59e0b' }}>
                                            {Object.values(visuals).filter(Boolean).length}/3
                                        </strong>
                                    </div>
                                    {specs.map(sp => (
                                        <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{sp.parameterName}</span>
                                            <strong style={{ color: specStatus(sp, measurements[sp.id] ?? '') === 'ok' ? '#10b981' : specStatus(sp, measurements[sp.id] ?? '') === 'fail' ? '#ef4444' : '#9ca3af' }}>
                                                {measurements[sp.id] || '—'}{sp.unit ? ` ${sp.unit}` : ''}
                                            </strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
