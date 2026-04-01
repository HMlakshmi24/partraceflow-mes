'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle, RefreshCw, Plus, Activity, Database } from 'lucide-react';

interface SPCPoint {
    value: number;
    measuredAt: string;
    inControl: boolean;
    violationType?: string;
}

interface SPCChartData {
    parameterId: string;
    parameterName: string;
    unit?: string;
    centerLine: number;
    ucl: number;
    lcl: number;
    usl?: number;
    lsl?: number;
    cp?: number;
    cpk?: number;
    points: SPCPoint[];
}

interface Parameter {
    id: string;
    parameterName: string;
    unit?: string;
    machine: { id: string; name: string };
    controlLimits: { ucl: number; lcl: number; centerLine: number; cp?: number; cpk?: number; sampleCount: number }[];
    _count: { spcRecords: number };
}

interface Machine { id: string; name: string; }

const CPK_COLOR = (cpk?: number) => {
    if (!cpk) return '#9ca3af';
    if (cpk >= 1.67) return '#10b981';
    if (cpk >= 1.33) return '#3b82f6';
    if (cpk >= 1.0) return '#f59e0b';
    return '#ef4444';
};

const CPK_LABEL = (cpk?: number) => {
    if (!cpk) return 'N/A';
    if (cpk >= 1.67) return 'Excellent';
    if (cpk >= 1.33) return 'Capable';
    if (cpk >= 1.0) return 'Marginal';
    return 'Incapable';
};

function XBarChart({ data }: { data: SPCChartData }) {
    const { points, ucl, lcl, centerLine, usl, lsl } = data;
    if (points.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No data points</div>;

    const W = 760, H = 260, PL = 60, PR = 20, PT = 20, PB = 40;
    const chartW = W - PL - PR;
    const chartH = H - PT - PB;

    const allVals = points.map(p => p.value);
    const allLimits = [ucl, lcl, usl, lsl, centerLine].filter((v): v is number => v !== undefined);
    const minV = Math.min(...allVals, ...allLimits) * 0.995;
    const maxV = Math.max(...allVals, ...allLimits) * 1.005;
    const range = maxV - minV || 1;

    const toY = (v: number) => PT + chartH - ((v - minV) / range) * chartH;
    const toX = (i: number) => PL + (i / Math.max(points.length - 1, 1)) * chartW;

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ');

    const hLine = (v: number, color: string, dash?: string) => (
        <line x1={PL} x2={W - PR} y1={toY(v)} y2={toY(v)} stroke={color} strokeWidth={1.5} strokeDasharray={dash} />
    );

    const nTicks = 5;
    const yTicks = Array.from({ length: nTicks }, (_, i) => minV + (range / (nTicks - 1)) * i);

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
            {/* Grid */}
            {yTicks.map((v, i) => (
                <g key={i}>
                    <line x1={PL} x2={W - PR} y1={toY(v)} y2={toY(v)} style={{ stroke: 'var(--card-border)' }} strokeWidth={1} />
                    <text x={PL - 6} y={toY(v) + 4} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">{v.toFixed(2)}</text>
                </g>
            ))}

            {/* Spec limits */}
            {usl !== undefined && hLine(usl, '#f59e0b20')}
            {lsl !== undefined && hLine(lsl, '#f59e0b20')}
            {usl !== undefined && <text x={W - PR + 2} y={toY(usl) + 4} fontSize={9} fill="#f59e0b">USL</text>}
            {lsl !== undefined && <text x={W - PR + 2} y={toY(lsl) + 4} fontSize={9} fill="#f59e0b">LSL</text>}

            {/* Control limits */}
            {hLine(ucl, '#ef4444', '4 2')}
            {hLine(lcl, '#ef4444', '4 2')}
            {hLine(centerLine, '#3b82f6', '6 3')}
            <text x={W - PR + 2} y={toY(ucl) + 4} fontSize={9} fill="#ef4444">UCL</text>
            <text x={W - PR + 2} y={toY(lcl) + 4} fontSize={9} fill="#ef4444">LCL</text>
            <text x={W - PR + 2} y={toY(centerLine) + 4} fontSize={9} fill="#3b82f6">CL</text>

            {/* Line */}
            <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={1.5} />

            {/* Points */}
            {points.map((p, i) => (
                <circle key={i} cx={toX(i)} cy={toY(p.value)} r={p.inControl ? 3 : 5}
                    fill={p.inControl ? '#6366f1' : '#ef4444'}
                    stroke={p.inControl ? 'none' : 'var(--card-bg)'}
                    strokeWidth={p.inControl ? 0 : 1.5}
                >
                    <title>{`${p.value.toFixed(4)} | ${new Date(p.measuredAt).toLocaleString()}${p.violationType ? ' | ' + p.violationType : ''}`}</title>
                </circle>
            ))}

            {/* X axis */}
            <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} style={{ stroke: 'var(--card-border)' }} strokeWidth={1} />
            {[0, Math.floor(points.length / 4), Math.floor(points.length / 2), Math.floor(3 * points.length / 4), points.length - 1].filter(i => i < points.length).map(i => (
                <text key={i} x={toX(i)} y={H - PB + 14} textAnchor="middle" fontSize={8} fill="var(--muted-foreground)">
                    {new Date(points[i].measuredAt).toLocaleDateString()}
                </text>
            ))}
        </svg>
    );
}

export default function SPCPage() {
    const [parameters, setParameters] = useState<Parameter[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [machineFilter, setMachineFilter] = useState('');
    const [selectedParam, setSelectedParam] = useState<Parameter | null>(null);
    const [chartData, setChartData] = useState<SPCChartData | null>(null);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const url = machineFilter ? `/api/spc?machineId=${machineFilter}` : '/api/spc';
        const r = await fetch(url);
        const d = await r.json();
        setParameters(d.parameters ?? []);
        setMachines(d.machines ?? []);
        setLoading(false);
    }, [machineFilter]);

    useEffect(() => { load(); }, [load]);

    const loadChart = async (param: Parameter) => {
        setSelectedParam(param);
        setChartLoading(true);
        const r = await fetch(`/api/spc?parameterId=${param.id}&points=100`);
        const d = await r.json();
        setChartData(d.data ?? null);
        setChartLoading(false);
    };

    const recalculate = async (paramId: string) => {
        await fetch('/api/spc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recalculate', parameterId: paramId }) });
        if (selectedParam?.id === paramId) loadChart(selectedParam);
        load();
    };

    const seedDemo = async () => {
        setSeeding(true);
        await fetch('/api/spc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed_demo' }) });
        await load();
        setSeeding(false);
    };

    const filtered = machineFilter ? parameters.filter(p => p.machine.id === machineFilter) : parameters;
    const violations = filtered.filter(p => p._count.spcRecords > 0).length;

    return (
        <div style={{ padding: '1.5rem', fontFamily: 'inherit', background: 'var(--background)', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <TrendingUp size={24} color="#6366f1" /> SPC / Process Control
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        Statistical Process Control — X-bar charts, Western Electric rules, Cp/Cpk indices
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={seedDemo} disabled={seeding} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.1rem', borderRadius: '0.5rem', border: '1px solid var(--card-border)', background: seeding ? 'var(--surface-muted)' : 'var(--card-bg)', color: seeding ? '#9ca3af' : 'var(--foreground)', cursor: seeding ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                        <Database size={15} /> {seeding ? 'Seeding…' : 'Seed Demo Data'}
                    </button>
                    <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.1rem', borderRadius: '0.5rem', border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                        <RefreshCw size={15} /> Refresh
                    </button>
                </div>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Parameters Monitored', value: filtered.length, color: '#6366f1', icon: <Activity size={20} /> },
                    { label: 'With SPC Data', value: filtered.filter(p => p._count.spcRecords > 0).length, color: '#10b981', icon: <CheckCircle size={20} /> },
                    { label: 'Capable (Cpk ≥ 1.33)', value: filtered.filter(p => (p.controlLimits[0]?.cpk ?? 0) >= 1.33).length, color: '#3b82f6', icon: <TrendingUp size={20} /> },
                    { label: 'Incapable (Cpk < 1.0)', value: filtered.filter(p => p.controlLimits.length > 0 && (p.controlLimits[0]?.cpk ?? 999) < 1.0).length, color: '#ef4444', icon: <AlertTriangle size={20} /> },
                ].map(k => (
                    <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: '0.75rem', border: '1px solid var(--card-border)', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
                            <div style={{ color: k.color, opacity: 0.8 }}>{k.icon}</div>
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: k.color, lineHeight: 1.1, marginTop: '0.3rem' }}>{k.value}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem', alignItems: 'start' }}>
                {/* Left — parameter list */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--card-border)' }}>
                        <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--card-border)', fontSize: '0.85rem', color: 'var(--foreground)', background: 'var(--card-bg)' }}>
                            <option value="" style={{ color: 'var(--foreground)' }}>All machines</option>
                            {machines.map(m => <option key={m.id} value={m.id} style={{ color: 'var(--foreground)' }}>{m.name}</option>)}
                        </select>
                    </div>

                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                            No parameters found.<br />
                            <button onClick={seedDemo} style={{ marginTop: '0.5rem', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', border: '1px solid var(--card-border)', background: 'var(--surface-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>Seed demo data</button>
                        </div>
                    ) : filtered.map(param => {
                        const limits = param.controlLimits[0];
                        const cpk = limits?.cpk;
                        const color = CPK_COLOR(cpk);
                        return (
                            <div key={param.id} onClick={() => loadChart(param)} style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--card-border)', cursor: 'pointer', background: selectedParam?.id === param.id ? 'rgba(99,102,241,0.1)' : 'transparent', borderLeft: selectedParam?.id === param.id ? '3px solid #6366f1' : '3px solid transparent' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)' }}>{param.parameterName}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{param.machine.name}{param.unit ? ` · ${param.unit}` : ''}</div>
                                    </div>
                                    {cpk !== undefined && cpk !== null ? (
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color }}>{cpk.toFixed(2)}</div>
                                            <div style={{ fontSize: '0.68rem', color, fontWeight: 600 }}>{CPK_LABEL(cpk)}</div>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{param._count.spcRecords} pts</span>
                                    )}
                                </div>
                                {limits && (
                                    <div style={{ marginTop: '0.4rem', height: 4, borderRadius: 2, background: 'var(--card-border)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${Math.min(100, ((cpk ?? 0) / 2) * 100)}%`, background: color, borderRadius: 2 }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Right — chart */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {selectedParam && chartData ? (
                        <>
                            {/* Chart header */}
                            <div style={{ background: 'linear-gradient(135deg, #312e81, #4f46e5)', borderRadius: '1rem', padding: '1.25rem 1.5rem', color: '#fff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em' }}>X-bar Control Chart</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{chartData.parameterName}</div>
                                        <div style={{ fontSize: '0.82rem', opacity: 0.75 }}>{selectedParam.machine.name}{chartData.unit ? ` · ${chartData.unit}` : ''}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'right', fontSize: '0.85rem' }}>
                                        {[
                                            { label: 'Cp', val: chartData.cp?.toFixed(3) ?? '—' },
                                            { label: 'Cpk', val: chartData.cpk?.toFixed(3) ?? '—' },
                                            { label: 'UCL', val: chartData.ucl.toFixed(4) },
                                            { label: 'LCL', val: chartData.lcl.toFixed(4) },
                                        ].map(s => (
                                            <div key={s.label}>
                                                <div style={{ opacity: 0.6, fontSize: '0.72rem', textTransform: 'uppercase' }}>{s.label}</div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{s.val}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {chartData.cpk !== undefined && (
                                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${Math.min(100, (chartData.cpk / 2) * 100)}%`, background: CPK_COLOR(chartData.cpk), borderRadius: 3 }} />
                                        </div>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: CPK_COLOR(chartData.cpk) }}>{CPK_LABEL(chartData.cpk)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Chart */}
                            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)' }}>Individual X Chart — {chartData.points.length} samples</div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={() => recalculate(selectedParam.id)} style={{ padding: '0.35rem 0.8rem', borderRadius: '0.4rem', border: '1px solid var(--card-border)', background: 'var(--surface-muted)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <RefreshCw size={13} /> Recalculate Limits
                                        </button>
                                    </div>
                                </div>
                                {chartLoading ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading chart…</div>
                                ) : (
                                    <XBarChart data={chartData} />
                                )}
                                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem', fontSize: '0.78rem', color: 'var(--muted-foreground)', flexWrap: 'wrap' }}>
                                    {[
                                        { color: '#6366f1', label: 'In-control point' },
                                        { color: '#ef4444', label: 'Out-of-control (violation)' },
                                        { color: '#3b82f6', line: true, label: 'Center line (CL)' },
                                        { color: '#ef4444', line: true, label: 'Control limits (UCL/LCL)' },
                                        { color: '#f59e0b', line: true, label: 'Spec limits (USL/LSL)' },
                                    ].map(l => (
                                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            {l.line
                                                ? <div style={{ width: 18, height: 2, background: l.color, borderRadius: 1 }} />
                                                : <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />}
                                            {l.label}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Out-of-control events */}
                            {chartData.points.filter(p => !p.inControl).length > 0 && (
                                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #fca5a5', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid rgba(239,68,68,0.3)', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertTriangle size={16} /> Out-of-Control Events ({chartData.points.filter(p => !p.inControl).length})
                                    </div>
                                    {chartData.points.filter(p => !p.inControl).slice(-10).reverse().map((p, i) => (
                                        <div key={i} style={{ padding: '0.7rem 1.25rem', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                            <div style={{ fontWeight: 600, color: '#dc2626' }}>{p.value.toFixed(4)}</div>
                                            <div style={{ color: 'var(--muted-foreground)' }}>{p.violationType?.replace(/_/g, ' ')}</div>
                                            <div style={{ color: '#9ca3af' }}>{new Date(p.measuredAt).toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', padding: '4rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                            <TrendingUp size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Select a parameter to view its control chart</p>
                            <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>X-bar chart with UCL/LCL, Cp/Cpk capability indices, and violation detection</p>
                            {filtered.length === 0 && (
                                <button onClick={seedDemo} disabled={seeding} style={{ padding: '0.65rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                                    {seeding ? 'Seeding…' : 'Load Demo SPC Data'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
