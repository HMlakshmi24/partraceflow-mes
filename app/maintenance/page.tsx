'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wrench, AlertTriangle, CheckCircle, Clock, TrendingDown, TrendingUp, Activity, RefreshCw, Thermometer, Zap } from 'lucide-react';

interface HealthPrediction {
    machineId: string;
    machineName: string;
    machineCode: string;
    healthScore: number;
    failureProbability: number;
    estimatedTimeToFailure?: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    maintenanceRecommendation: string;
    indicators?: { name: string; value: string; status: string }[];
    lastUpdated?: string;
}

const RISK_CONFIG: Record<string, { bg: string; border: string; text: string; badge: string; icon: React.ReactNode }> = {
    LOW:      { bg: '#d1fae5', border: '#10b981', text: '#065f46', badge: '#10b981', icon: <CheckCircle size={14} /> },
    MEDIUM:   { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', badge: '#f59e0b', icon: <Clock size={14} /> },
    HIGH:     { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', badge: '#ef4444', icon: <AlertTriangle size={14} /> },
    CRITICAL: { bg: '#fce7f3', border: '#db2777', text: '#9d174d', badge: '#db2777', icon: <Zap size={14} /> },
};

function HealthGauge({ score }: { score: number }) {
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#ef4444' : '#db2777';
    const rotation = -135 + (score / 100) * 270;
    return (
        <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="6" strokeDasharray="201 201" strokeDashoffset="50" strokeLinecap="round" transform="rotate(135 40 40)" />
                <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="6"
                    strokeDasharray={`${(score / 100) * 150.8} 201`} strokeDashoffset="50" strokeLinecap="round" transform="rotate(135 40 40)" />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: '0.55rem', color: '#9ca3af', fontWeight: 600 }}>HEALTH</div>
            </div>
        </div>
    );
}

export default function MaintenancePage() {
    const [predictions, setPredictions] = useState<HealthPrediction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<HealthPrediction | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/maintenance/predict');
            if (res.ok) {
                const data = await res.json();
                const preds: HealthPrediction[] = (data.predictions ?? []).map((p: any) => ({
                    machineId: p.machineId,
                    machineName: p.machineName ?? p.machineId,
                    machineCode: p.machineCode ?? '—',
                    healthScore: Math.round(p.healthScore ?? 100),
                    failureProbability: Math.round((p.failureProbability ?? 0) * 100),
                    estimatedTimeToFailure: p.estimatedTimeToFailure,
                    riskLevel: p.riskLevel ?? (p.healthScore < 30 ? 'CRITICAL' : p.healthScore < 50 ? 'HIGH' : p.healthScore < 70 ? 'MEDIUM' : 'LOW'),
                    maintenanceRecommendation: p.maintenanceRecommendation ?? p.recommendation ?? 'No action required',
                    indicators: p.indicators ?? [],
                    lastUpdated: p.lastUpdated ?? p.calculatedAt,
                }));
                // Sort by health score (worst first)
                preds.sort((a, b) => a.healthScore - b.healthScore);
                setPredictions(preds);
                if (preds.length > 0 && !selected) setSelected(preds[0]);
            }
        } catch { /* ignore */ }
        setLastRefresh(new Date());
        setLoading(false);
    }, []);

    useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

    const filtered = filter === 'ALL' ? predictions : predictions.filter(p => p.riskLevel === filter);
    const critical = predictions.filter(p => p.riskLevel === 'CRITICAL').length;
    const high = predictions.filter(p => p.riskLevel === 'HIGH').length;
    const healthy = predictions.filter(p => p.riskLevel === 'LOW').length;

    return (
        <div style={{ padding: '1.5rem', fontFamily: 'inherit' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Wrench size={24} color="#3b82f6" /> Predictive Maintenance
                    </h1>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>Machine health scores · Failure prediction · Maintenance recommendations</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {lastRefresh && <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Updated {lastRefresh.toLocaleTimeString()}</span>}
                    <button onClick={load} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', cursor: 'pointer', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {/* KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Critical Risk', value: critical, color: '#db2777', icon: <Zap size={20} /> },
                    { label: 'High Risk', value: high, color: '#ef4444', icon: <AlertTriangle size={20} /> },
                    { label: 'Machines Healthy', value: healthy, color: '#10b981', icon: <CheckCircle size={20} /> },
                    { label: 'Avg Health Score', value: predictions.length ? Math.round(predictions.reduce((s, p) => s + p.healthScore, 0) / predictions.length) + '%' : '—', color: '#3b82f6', icon: <Activity size={20} /> },
                ].map(kpi => (
                    <div key={kpi.label} style={{ background: 'var(--card-bg)', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ color: kpi.color }}>{kpi.icon}</div>
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>{kpi.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
                    <p>Calculating machine health scores...</p>
                </div>
            ) : predictions.length === 0 ? (
                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                    <Wrench size={48} style={{ opacity: 0.25, marginBottom: '1rem' }} />
                    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No machine health data available</p>
                    <p style={{ fontSize: '0.85rem' }}>Seed demo data from <a href="/settings" style={{ color: '#3b82f6' }}>Settings</a> to generate health predictions.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
                    {/* Machine list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {/* Filter bar */}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(f => (
                                <button key={f} onClick={() => setFilter(f)} style={{
                                    padding: '0.3rem 0.9rem', borderRadius: '999px', border: `1px solid ${filter === f ? '#3b82f6' : 'var(--card-border)'}`,
                                    background: filter === f ? '#3b82f6' : 'var(--card-bg)', color: filter === f ? 'var(--card-bg)' : 'var(--foreground)',
                                    cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
                                }}>
                                    {f} {f !== 'ALL' && `(${predictions.filter(p => p.riskLevel === f).length})`}
                                </button>
                            ))}
                        </div>

                        {filtered.map(p => {
                            const cfg = RISK_CONFIG[p.riskLevel];
                            const isSel = selected?.machineId === p.machineId;
                            return (
                                <div key={p.machineId} onClick={() => setSelected(p)} style={{
                                    background: 'var(--card-bg)', borderRadius: '0.75rem', border: `2px solid ${isSel ? '#3b82f6' : 'var(--card-border)'}`,
                                    padding: '1rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
                                    boxShadow: isSel ? '0 0 0 3px rgba(59,130,246,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                                    transition: 'all 0.15s',
                                }}>
                                    <HealthGauge score={p.healthScore} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {p.machineCode}
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', background: cfg.bg, color: cfg.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                {cfg.icon} {p.riskLevel}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginBottom: '0.4rem' }}>{p.machineName}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--foreground)', background: 'var(--background)', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', display: 'inline-block' }}>
                                            {p.maintenanceRecommendation}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Fail risk</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: cfg.badge }}>{p.failureProbability}%</div>
                                        {p.estimatedTimeToFailure != null && (
                                            <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>~{p.estimatedTimeToFailure}h</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Detail panel */}
                    {selected && (() => {
                        const cfg = RISK_CONFIG[selected.riskLevel];
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1rem', height: 'fit-content' }}>
                                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '1.25rem', borderBottom: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                            <HealthGauge score={selected.healthScore} />
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{selected.machineCode}</div>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>{selected.machineName}</div>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: '999px', background: cfg.bg, color: cfg.text, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                                                    {cfg.icon} {selected.riskLevel} RISK
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            {[
                                                { label: 'Health Score', value: `${selected.healthScore}/100` },
                                                { label: 'Failure Probability', value: `${selected.failureProbability}%` },
                                                { label: 'Est. Time to Failure', value: selected.estimatedTimeToFailure != null ? `~${selected.estimatedTimeToFailure}h` : 'N/A' },
                                                { label: 'Last Updated', value: selected.lastUpdated ? new Date(selected.lastUpdated).toLocaleTimeString() : '—' },
                                            ].map(item => (
                                                <div key={item.label} style={{ background: 'var(--background)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.2rem' }}>{item.label}</div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{item.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>Recommendation</div>
                                        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: cfg.bg, border: `1px solid ${cfg.border}`, fontSize: '0.85rem', color: cfg.text, fontWeight: 500 }}>
                                            {selected.maintenanceRecommendation}
                                        </div>
                                    </div>

                                    {selected.indicators && selected.indicators.length > 0 && (
                                        <div style={{ padding: '1rem 1.25rem' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>Health Indicators</div>
                                            {selected.indicators.map((ind, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #f9fafb' }}>
                                                    <span style={{ fontSize: '0.82rem', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <Thermometer size={12} color="#6b7280" /> {ind.name}
                                                    </span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{ind.value}</span>
                                                        {ind.status === 'NORMAL' ? <TrendingUp size={12} color="#10b981" /> : <TrendingDown size={12} color="#ef4444" />}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <button style={{ padding: '0.75rem', borderRadius: '0.6rem', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                        onClick={() => alert(`Maintenance work order created for ${selected.machineName}.\n\nIn production, this would create a Work Order in the ERP system and notify the maintenance team via Andon/email.`)}>
                                        <Wrench size={16} /> Create Maintenance Work Order
                                    </button>
                                    <button style={{ padding: '0.75rem', borderRadius: '0.6rem', border: '1px solid #e5e7eb', background: 'var(--card-bg)', color: 'var(--foreground)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                        onClick={() => alert(`Refreshing health score for ${selected.machineName}...`)}>
                                        <RefreshCw size={16} /> Refresh Health Score
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
