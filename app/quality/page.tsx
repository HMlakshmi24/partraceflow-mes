'use client';

import { CheckCircle, XCircle, Camera, Save, Clipboard, TrendingUp, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import styles from './quality.module.css';

interface Measurements { diameter: string; weight: string; torque: string; }
interface VisualChecks { surfaceFinish: boolean; colorMatch: boolean; labelAlignment: boolean; }

// Spec limits for auto-validation
const SPECS = {
    diameter: { min: 24.9, max: 25.1, unit: 'mm', placeholder: 'Spec: 25.0 ±0.1' },
    weight: { min: 135, max: 145, unit: 'g', placeholder: 'Spec: 140 ±5' },
    torque: { min: 12.5, max: 999, unit: 'Nm', placeholder: 'Min: 12.5' },
};

function specStatus(field: keyof typeof SPECS, val: string): 'ok' | 'fail' | 'none' {
    if (!val) return 'none';
    const n = parseFloat(val);
    if (isNaN(n)) return 'none';
    const s = SPECS[field];
    return n >= s.min && n <= s.max ? 'ok' : 'fail';
}

export default function QualityGatePage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [orderId, setOrderId] = useState('');
    const [inspector] = useState('Inspector_01');
    const [status, setStatus] = useState<'PENDING' | 'PASS' | 'FAIL' | 'REWORK'>('PENDING');
    const [notes, setNotes] = useState('');
    const [defectType, setDefect] = useState('');
    const [measurements, setMeas] = useState<Measurements>({ diameter: '', weight: '', torque: '' });
    const [visuals, setVisuals] = useState<VisualChecks>({ surfaceFinish: false, colorMatch: false, labelAlignment: false });
    const [submitting, setSubmit] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; orderStatus?: string } | null>(null);
    const [history, setHistory] = useState<any[]>([]);

    // Load orders for inspection
    useEffect(() => {
        fetch('/api/quality')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) setOrders(data);
                else if (data?.error) console.warn('[Quality] API error:', data.error);
            })
            .catch(err => console.error('[Quality] fetch failed:', err));
    }, []);

    // Load inspection history when order selected
    useEffect(() => {
        if (!orderId) { setHistory([]); return; }
        fetch(`/api/quality?orderId=${orderId}`)
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setHistory(data); })
            .catch(() => { });
    }, [orderId]);

    // Auto-suggest outcome based on measurements + visual checks
    const autoSuggest = (): 'PASS' | 'FAIL' | null => {
        const allVisual = visuals.surfaceFinish && visuals.colorMatch && visuals.labelAlignment;
        const dSt = specStatus('diameter', measurements.diameter);
        const wSt = specStatus('weight', measurements.weight);
        const tSt = specStatus('torque', measurements.torque);
        if (dSt === 'fail' || wSt === 'fail' || tSt === 'fail') return 'FAIL';
        if (allVisual && dSt === 'ok' && wSt === 'ok' && tSt === 'ok') return 'PASS';
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
                    measurements: { diameter: measurements.diameter, weight: measurements.weight, torque: measurements.torque },
                    visualChecks: visuals,
                })
            });
            const data = await res.json();
            if (res.ok) {
                setResult({ success: true, message: `Inspection submitted: ${status}`, orderStatus: data.orderStatus });
                // Reload orders + history
                const r2 = await fetch('/api/quality');
                const d2 = await r2.json();
                if (Array.isArray(d2)) setOrders(d2);
                const r3 = await fetch(`/api/quality?orderId=${orderId}`);
                const d3 = await r3.json();
                if (Array.isArray(d3)) setHistory(d3);
                // Reset form
                setStatus('PENDING'); setNotes(''); setDefect('');
                setMeas({ diameter: '', weight: '', torque: '' });
                setVisuals({ surfaceFinish: false, colorMatch: false, labelAlignment: false });
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
                                ? <option value="" style={{ color: 'var(--foreground)', background: 'var(--card-bg)' }}>— No orders found (seed demo data) —</option>
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
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                {([
                                    ['diameter', 'Diameter (mm)'],
                                    ['weight', 'Weight (g)'],
                                    ['torque', 'Torque Test (Nm)'],
                                ] as [keyof typeof SPECS, string][]).map(([field, label]) => {
                                    const st = specStatus(field, measurements[field as keyof Measurements]);
                                    return (
                                        <div key={field}>
                                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--muted-foreground)' }}>{label}</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder={SPECS[field].placeholder}
                                                    className={styles.input}
                                                    value={measurements[field as keyof Measurements]}
                                                    onChange={e => setMeas(m => ({ ...m, [field]: e.target.value }))}
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
                            <div style={{ border: '2px dashed var(--card-border)', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--surface-muted)' }}
                                onDragOver={e => e.preventDefault()}
                                onClick={() => alert('In a production system, this opens the camera or file browser. Evidence files stored in document management.')}>
                                <Camera size={48} style={{ margin: '0 auto', marginBottom: '1rem', opacity: 0.5 }} />
                                <p>Click or drag photos to attach evidence</p>
                                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>(JPG, PNG, PDF supported)</p>
                            </div>
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

                                <button
                                    onClick={handleSubmit}
                                    className={styles.submitButton}
                                    style={{ width: '100%', marginTop: '1rem' }}
                                    disabled={status === 'PENDING' || submitting || !orderId}
                                >
                                    <Save size={18} style={{ display: 'inline', marginRight: '6px' }} />
                                    {submitting ? 'Submitting...' : !orderId ? 'Select an Order' : status === 'PENDING' ? 'Select Outcome' : `Submit ${status}`}
                                </button>

                                {/* Result summary card */}
                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Visual checks</span>
                                        <strong style={{ color: Object.values(visuals).every(Boolean) ? '#10b981' : '#f59e0b' }}>
                                            {Object.values(visuals).filter(Boolean).length}/3
                                        </strong>
                                    </div>
                                    {(['diameter', 'weight', 'torque'] as (keyof typeof SPECS)[]).map(f => (
                                        <div key={f} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{f.charAt(0).toUpperCase() + f.slice(1)}</span>
                                            <strong style={{ color: specStatus(f, measurements[f as keyof Measurements]) === 'ok' ? '#10b981' : specStatus(f, measurements[f as keyof Measurements]) === 'fail' ? '#ef4444' : '#9ca3af' }}>
                                                {measurements[f as keyof Measurements] || '—'} {measurements[f as keyof Measurements] ? SPECS[f].unit : ''}
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
