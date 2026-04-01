'use client';

import { useState } from 'react';
import { Search, GitBranch, Package, Clock, User, Cpu, ChevronRight, AlertCircle, CheckCircle, Box } from 'lucide-react';

interface GenealogyResult {
    serialNumber: string;
    product: { name: string; sku: string };
    batch: { batchNumber: string; workOrder: string; quantity: number };
    rawMaterials: { lotNumber: string; quantity: number; unit: string; usedAt: string }[];
    operations: { eventType: string; timestamp: string; machineId?: string; operatorId?: string; data: any }[];
}

interface LotTrace {
    lot: string;
    usedInBatches: { batchNumber: string; workOrder: string; product: string; serialNumbers: string[] }[];
}

const EVENT_COLOR: Record<string, string> = {
    PRODUCTION_START: '#3b82f6', SERIAL_ASSIGNED: '#8b5cf6', QUALITY_PASS: '#10b981',
    QUALITY_FAIL: '#ef4444', TASK_COMPLETE: '#f59e0b', MACHINE_START: '#06b6d4',
};

const EVENT_ICON: Record<string, React.ReactNode> = {
    PRODUCTION_START: <Package size={14} />, SERIAL_ASSIGNED: <Box size={14} />,
    QUALITY_PASS: <CheckCircle size={14} />, QUALITY_FAIL: <AlertCircle size={14} />,
    TASK_COMPLETE: <CheckCircle size={14} />,
};

export default function TraceabilityPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<'serial' | 'lot'>('serial');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GenealogyResult | null>(null);
    const [lotResult, setLotResult] = useState<LotTrace | null>(null);
    const [error, setError] = useState('');

    const buildStatus = (ops: GenealogyResult['operations']) => {
        if (!ops || ops.length === 0) return { label: 'No events', color: 'var(--muted-foreground)' };
        const last = ops[ops.length - 1]?.eventType ?? 'UNKNOWN';
        if (last === 'SHIPMENT') return { label: 'Shipped', color: '#2563eb' };
        if (last === 'QUALITY_FAIL') return { label: 'On Hold', color: '#dc2626' };
        if (last === 'QUALITY_PASS') return { label: 'Quality Passed', color: '#16a34a' };
        return { label: 'In Process', color: '#f59e0b' };
    };

    const search = async () => {
        if (!searchTerm.trim()) return;
        setLoading(true); setError(''); setResult(null); setLotResult(null);
        try {
            const url = searchType === 'serial'
                ? `/api/traceability/${encodeURIComponent(searchTerm.trim())}`
                : `/api/traceability/${encodeURIComponent(searchTerm.trim())}?type=lot`;
            const res = await fetch(url);
            const d = await res.json();
            if (!res.ok) { setError(d.error ?? 'Not found'); }
            else if (searchType === 'serial') setResult(d);
            else setLotResult(d);
        } catch { setError('Network error'); }
        setLoading(false);
    };

    return (
        <div style={{ padding: '1.5rem', fontFamily: 'inherit', background: 'var(--background)', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <GitBranch size={24} color="#8b5cf6" /> Traceability & Genealogy
                </h1>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                    Full forward/backward trace by serial number or lot — who made it, what materials, on which machine
                </p>
            </div>

            {/* Search bar */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--card-border)', flexShrink: 0 }}>
                        {(['serial', 'lot'] as const).map(t => (
                            <button key={t} onClick={() => setSearchType(t)} style={{ padding: '0.6rem 1rem', border: 'none', background: searchType === t ? '#3b82f6' : 'var(--card-bg)', color: searchType === t ? 'var(--card-bg)' : 'var(--foreground)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                                {t === 'serial' ? 'Serial #' : 'Lot #'}
                            </button>
                        ))}
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && search()}
                            placeholder={searchType === 'serial' ? 'e.g. SN-2024-001234' : 'e.g. LOT-2024-A001'}
                            style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.25rem', borderRadius: '0.5rem', border: '1.5px solid var(--card-border)', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none', background: 'var(--card-bg)', color: 'var(--foreground)' }}
                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                            onBlur={e => e.target.style.borderColor = 'var(--card-border)'}
                        />
                    </div>
                    <button onClick={search} disabled={loading || !searchTerm.trim()} style={{ padding: '0.65rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: loading || !searchTerm.trim() ? 'var(--card-border)' : '#3b82f6', color: loading || !searchTerm.trim() ? '#9ca3af' : 'var(--card-bg)', fontWeight: 700, cursor: loading || !searchTerm.trim() ? 'not-allowed' : 'pointer', fontSize: '0.9rem', flexShrink: 0 }}>
                        {loading ? 'Searching...' : 'Trace'}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    {['SN-DEMO-001', 'SN-DEMO-002', 'LOT-RAW-A01'].map(ex => (
                        <button key={ex} onClick={() => { setSearchTerm(ex); setSearchType(ex.startsWith('LOT') ? 'lot' : 'serial'); }} style={{ padding: '0.25rem 0.65rem', borderRadius: '999px', border: '1px solid var(--card-border)', background: 'var(--surface-muted)', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: '0.75rem' }}>
                            {ex}
                        </button>
                    ))}
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', alignSelf: 'center' }}>Try an example</span>
                </div>
            </div>

            {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={18} /> {error}
                </div>
            )}

            {/* Serial Genealogy Result */}
            {result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Identity Card */}
                    <div style={{ background: 'linear-gradient(135deg, #1e40af, #7c3aed)', borderRadius: '1rem', padding: '1.5rem', color: '#fff' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Serial Number</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.02em' }}>{result.serialNumber}</div>
                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '2rem', fontSize: '0.85rem', opacity: 0.85 }}>
                            <div><div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Product</div><div style={{ fontWeight: 600 }}>{result.product?.name}</div></div>
                            <div><div style={{ opacity: 0.7, fontSize: '0.75rem' }}>SKU</div><div style={{ fontWeight: 600 }}>{result.product?.sku}</div></div>
                            <div><div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Batch</div><div style={{ fontWeight: 600 }}>{result.batch?.batchNumber}</div></div>
                            <div><div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Work Order</div><div style={{ fontWeight: 600 }}>{result.batch?.workOrder}</div></div>
                        </div>
                    </div>

                    {/* Summary Row */}
                    {(() => {
                        const status = buildStatus(result.operations);
                        const last = result.operations[result.operations.length - 1];
                        return (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.85rem', padding: '0.9rem 1rem' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', fontWeight: 700 }}>Status</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: status.color, marginTop: '0.35rem' }}>{status.label}</div>
                                </div>
                                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.85rem', padding: '0.9rem 1rem' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', fontWeight: 700 }}>Operations</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--foreground)', marginTop: '0.35rem' }}>{result.operations.length}</div>
                                </div>
                                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.85rem', padding: '0.9rem 1rem' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', fontWeight: 700 }}>Materials Lots</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--foreground)', marginTop: '0.35rem' }}>{result.rawMaterials.length}</div>
                                </div>
                                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.85rem', padding: '0.9rem 1rem' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', fontWeight: 700 }}>Last Event</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)', marginTop: '0.35rem' }}>
                                        {last ? last.eventType.replace(/_/g, ' ') : '—'}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{last ? new Date(last.timestamp).toLocaleString() : ''}</div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Genealogy Flow */}
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Genealogy Flow</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, auto)', gap: '0.6rem', alignItems: 'center', overflowX: 'auto' }}>
                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.6rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--foreground)', fontWeight: 700 }}>
                                Lot {result.rawMaterials[0]?.lotNumber ?? '—'}
                            </div>
                            <ChevronRight size={18} color="var(--muted-foreground)" />
                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.6rem', background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--foreground)', fontWeight: 700 }}>
                                Batch {result.batch?.batchNumber}
                            </div>
                            <ChevronRight size={18} color="var(--muted-foreground)" />
                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.6rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--foreground)', fontWeight: 700 }}>
                                Serial {result.serialNumber}
                            </div>
                            <ChevronRight size={18} color="var(--muted-foreground)" />
                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.6rem', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--foreground)', fontWeight: 700 }}>
                                Quality Check
                            </div>
                            <ChevronRight size={18} color="var(--muted-foreground)" />
                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.6rem', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', color: 'var(--foreground)', fontWeight: 700 }}>
                                Shipment
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                        {/* Raw Materials */}
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Package size={16} color="#f59e0b" /> Raw Materials Used
                            </div>
                            {result.rawMaterials.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>No material records</div>
                            ) : result.rawMaterials.map((m, i) => (
                                <div key={i} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.lotNumber}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{new Date(m.usedAt).toLocaleString()}</div>
                                    </div>
                                    <span style={{ padding: '2px 10px', borderRadius: '999px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600, fontSize: '0.8rem' }}>{m.quantity} {m.unit}</span>
                                </div>
                            ))}
                        </div>

                        {/* Operations Timeline */}
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={16} color="#3b82f6" /> Operation History ({result.operations.length})
                            </div>
                            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                                {result.operations.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>No operations recorded</div>
                                ) : result.operations.map((op, i) => {
                                    const color = EVENT_COLOR[op.eventType] ?? 'var(--muted-foreground)';
                                    return (
                                        <div key={i} style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--card-border)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <div style={{ marginTop: '2px', width: 24, height: 24, borderRadius: '50%', background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
                                                {EVENT_ICON[op.eventType] ?? <ChevronRight size={12} />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color }}>{op.eventType.replace(/_/g, ' ')}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                                                    {new Date(op.timestamp).toLocaleString()}
                                                    {op.machineId && <span> · Machine: {op.machineId.slice(0, 8)}</span>}
                                                    {op.operatorId && <span> · Op: {op.operatorId}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lot Forward Trace Result */}
            {lotResult && (
                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ background: 'linear-gradient(135deg, #047857, #0284c7)', padding: '1.25rem 1.5rem', color: '#fff' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, textTransform: 'uppercase' }}>Forward Trace — Lot</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{lotResult.lot}</div>
                        <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.25rem' }}>Used in {lotResult.usedInBatches.length} batch{lotResult.usedInBatches.length !== 1 ? 'es' : ''}</div>
                    </div>
                    {lotResult.usedInBatches.map((b, i) => (
                        <div key={i} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--card-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{b.batchNumber}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>{b.workOrder} · {b.product}</div>
                                </div>
                                <span style={{ padding: '2px 10px', borderRadius: '999px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 600, fontSize: '0.8rem' }}>{b.serialNumbers.length} serials</span>
                            </div>
                            {b.serialNumbers.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                    {b.serialNumbers.slice(0, 12).map(sn => (
                                        <button key={sn} onClick={() => { setSearchTerm(sn); setSearchType('serial'); search(); }} style={{ padding: '2px 8px', borderRadius: '0.3rem', border: '1px solid var(--card-border)', background: 'var(--surface-muted)', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                            {sn}
                                        </button>
                                    ))}
                                    {b.serialNumbers.length > 12 && <span style={{ fontSize: '0.75rem', color: '#9ca3af', alignSelf: 'center' }}>+{b.serialNumbers.length - 12} more</span>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!result && !lotResult && !error && !loading && (
                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', padding: '4rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                    <GitBranch size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Enter a Serial or Lot number to trace</p>
                    <p style={{ fontSize: '0.85rem' }}>Full genealogy: raw materials used, machines operated on, operators, quality results</p>
                </div>
            )}
        </div>
    );
}
