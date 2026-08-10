'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
    Factory, Activity, AlertTriangle, Wrench, Power, RefreshCw,
    Wifi, WifiOff, ChevronDown, ChevronRight, Zap, Thermometer, Gauge,
    CheckCircle, Clock, Plug,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelemetryPoint { signal: string; value: string; unit: string | null }

interface MachineLive {
    id: string; code: string; name: string; status: string; oee: number;
    lineName: string; areaName: string; currentJob?: string;
    telemetry: TelemetryPoint[];
    openDowntimeId?: string;
    openDowntimeReason?: string;
    openDowntimeMins?: number;
}

interface FactoryTree {
    enterprise: string; plant: string;
    areas: { name: string; lines: { name: string; machines: MachineLive[] }[] }[];
    ungrouped: MachineLive[];
}

// ─── Static config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
    RUNNING:     { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: '#10b981',               icon: <Activity size={14} />,      label: 'Running' },
    IDLE:        { color: 'var(--muted-foreground)', bg: 'rgba(107,114,128,0.12)', border: 'var(--muted-foreground)', icon: <Power size={14} />,        label: 'Idle' },
    DOWN:        { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: '#ef4444',               icon: <AlertTriangle size={14} />, label: 'Down' },
    MAINTENANCE: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: '#f59e0b',               icon: <Wrench size={14} />,        label: 'Maintenance' },
};

const SIGNAL_ICONS: Record<string, React.ReactNode> = {
    temperature:  <Thermometer size={12} />,
    spindle_speed: <Gauge size={12} />,
    vibration:    <Activity size={12} />,
    parts_counter: <Zap size={12} />,
    feed_rate:    <Gauge size={12} />,
    current:      <Zap size={12} />,
    pressure:     <Gauge size={12} />,
};

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchFactoryTree(): Promise<FactoryTree | null> {
    try {
        const res = await fetch('/api/machines', { credentials: 'include' });
        if (!res.ok) return null;
        const { machines } = await res.json();
        if (!machines || machines.length === 0) return null;

        const telemetryMap: Record<string, TelemetryPoint[]> = {};
        try {
            const tRes = await fetch('/api/machines/telemetry', { credentials: 'include' });
            if (tRes.ok) {
                const tData = await tRes.json();
                for (const t of tData.telemetry ?? []) {
                    if (!telemetryMap[t.machineId]) telemetryMap[t.machineId] = [];
                    telemetryMap[t.machineId].push({
                        signal: t.signalName ?? t.signal?.signalName ?? 'signal',
                        value: t.value,
                        unit: t.unit ?? t.signal?.unit ?? null,
                    });
                }
            }
        } catch { /* telemetry optional */ }

        const openDowntimeMap: Record<string, { id: string; reason: string; mins: number }> = {};
        try {
            const dtRes = await fetch('/api/downtime?open=true', { credentials: 'include' });
            if (dtRes.ok) {
                const dtData = await dtRes.json();
                for (const ev of dtData.downtimeEvents ?? []) {
                    if (ev.machineId) {
                        openDowntimeMap[ev.machineId] = {
                            id: ev.id,
                            reason: ev.reason?.name ?? 'Reason not recorded',
                            mins: Math.round((Date.now() - new Date(ev.startTime).getTime()) / 60000),
                        };
                    }
                }
            }
        } catch { /* downtime optional */ }

        const areaMap: Record<string, { name: string; lines: Record<string, { name: string; machines: MachineLive[] }> }> = {};
        const ungrouped: MachineLive[] = [];

        for (const m of machines) {
            const tele = (telemetryMap[m.id] ?? []).slice(0, 4);
            const hasOpenDowntime = Boolean(openDowntimeMap[m.id]);
            const rawStatus = (m.status ?? 'IDLE').toUpperCase();
            const normalizedStatus = hasOpenDowntime ? 'DOWN' : (rawStatus === 'DOWN' ? 'IDLE' : rawStatus);

            const machine: MachineLive = {
                id: m.id, code: m.code, name: m.name,
                status: normalizedStatus,
                oee: Math.round(m.oee ?? 0),
                lineName: m.productionLine?.name ?? '',
                areaName: m.productionLine?.area?.name ?? '',
                telemetry: tele,
                openDowntimeId: openDowntimeMap[m.id]?.id,
                openDowntimeReason: openDowntimeMap[m.id]?.reason,
                openDowntimeMins: openDowntimeMap[m.id]?.mins,
            };

            const areaName = m.productionLine?.area?.name;
            const lineName = m.productionLine?.name;

            if (areaName && lineName) {
                if (!areaMap[areaName]) areaMap[areaName] = { name: areaName, lines: {} };
                if (!areaMap[areaName].lines[lineName]) areaMap[areaName].lines[lineName] = { name: lineName, machines: [] };
                areaMap[areaName].lines[lineName].machines.push(machine);
            } else {
                ungrouped.push(machine);
            }
        }

        const areas = Object.values(areaMap).map(a => ({ name: a.name, lines: Object.values(a.lines) }));

        let enterprise = '';
        let plant = '';
        try {
            const setupRes = await fetch('/api/pipe-spool/summary');
            if (setupRes.ok) {
                const setup = await setupRes.json();
                enterprise = setup.enterprise ?? '';
                plant = setup.plant ?? '';
            }
        } catch { /* use empty defaults */ }

        return {
            enterprise: enterprise || 'Factory',
            plant: plant || 'Production Facility',
            areas,
            ungrouped,
        };
    } catch {
        return null;
    }
}

// ─── MachineCard ─────────────────────────────────────────────────────────────

function MachineCard({ machine, selected, onSelect }: { machine: MachineLive; selected: boolean; onSelect: () => void }) {
    const cfg = STATUS_CONFIG[machine.status] ?? STATUS_CONFIG.IDLE;
    const oeeColor = machine.oee >= 85 ? '#10b981' : machine.oee >= 65 ? '#f59e0b' : machine.oee > 0 ? '#ef4444' : '#475569';

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={e => e.key === 'Enter' && onSelect()}
            style={{
                background: selected ? cfg.bg : 'var(--card-bg)',
                border: `2px solid ${selected ? cfg.color : 'var(--card-border)'}`,
                borderRadius: '0.75rem', padding: '0.9rem',
                cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                minWidth: '155px', maxWidth: '190px',
                boxShadow: 'var(--shadow-soft)',
                outline: 'none',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--foreground)' }}>{machine.code}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: cfg.color, fontWeight: 600 }}>
                    {cfg.icon} {cfg.label}
                </span>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.6rem', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {machine.name}
            </div>

            {machine.currentJob && (
                <div style={{ fontSize: '0.68rem', color: '#67e8f9', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <CheckCircle size={10} /> {machine.currentJob}
                </div>
            )}

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.2rem' }}>
                    <span>OEE</span>
                    <span style={{ color: oeeColor, fontWeight: 700 }}>{machine.oee > 0 ? `${machine.oee}%` : '—'}</span>
                </div>
                <div style={{ height: '4px', background: 'var(--card-border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${machine.oee}%`, height: '100%', background: oeeColor, transition: 'width 0.4s' }} />
                </div>
            </div>

            {machine.telemetry.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                    {machine.telemetry.slice(0, 3).map((t, i) => (
                        <span key={i} title={`${t.signal}: ${t.value} ${t.unit ?? ''}`} style={{
                            display: 'flex', alignItems: 'center', gap: '0.15rem',
                            fontSize: '0.66rem', color: '#94a3b8',
                            background: 'rgba(255,255,255,0.05)',
                            padding: '0.12rem 0.35rem', borderRadius: '0.25rem',
                        }}>
                            {SIGNAL_ICONS[t.signal] ?? <Gauge size={10} />}
                            {parseFloat(t.value) > 0 ? parseFloat(t.value).toFixed(0) : '—'}{t.unit ?? ''}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Area section ─────────────────────────────────────────────────────────────

function AreaSection({ area, selectedId, onSelect }: {
    area: FactoryTree['areas'][0];
    selectedId: string | null;
    onSelect: (m: MachineLive) => void;
}) {
    const [open, setOpen] = useState(true);
    const all = area.lines.flatMap(l => l.machines);
    const running = all.filter(m => m.status === 'RUNNING').length;
    const down    = all.filter(m => m.status === 'DOWN').length;
    const maint   = all.filter(m => m.status === 'MAINTENANCE').length;

    return (
        <div style={{ marginBottom: '1.75rem' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--foreground)', fontWeight: 700, fontSize: '0.95rem',
                    marginBottom: '0.75rem', padding: 0,
                }}
            >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{area.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 400 }}>({all.length} machines)</span>
                {running > 0 && <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.2)',  color: '#10b981', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontWeight: 600 }}>{running} running</span>}
                {down > 0    && <span style={{ fontSize: '0.68rem', background: 'rgba(239,68,68,0.2)',   color: '#ef4444', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontWeight: 600 }}>{down} down</span>}
                {maint > 0   && <span style={{ fontSize: '0.68rem', background: 'rgba(245,158,11,0.2)',  color: '#f59e0b', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontWeight: 600 }}>{maint} maintenance</span>}
            </button>

            {open && area.lines.map(line => (
                <div key={line.name} style={{ marginBottom: '1rem', paddingLeft: '1.25rem', borderLeft: '2px solid var(--card-border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--card-border)', display: 'inline-block' }} />
                        {line.name}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', paddingLeft: '0.5rem' }}>
                        {line.machines.map(m => (
                            <MachineCard key={m.id} machine={m} selected={selectedId === m.id} onSelect={() => onSelect(m)} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ machine, onClose, onResolved }: { machine: MachineLive; onClose: () => void; onResolved: () => void }) {
    const cfg = STATUS_CONFIG[machine.status] ?? STATUS_CONFIG.IDLE;
    const oeeColor = machine.oee >= 85 ? '#10b981' : machine.oee >= 65 ? '#f59e0b' : machine.oee > 0 ? '#ef4444' : '#475569';
    const isDown = machine.status === 'DOWN';
    const [resolveNotes, setResolveNotes] = useState('');
    const [resolving, setResolving]       = useState(false);
    const [resolveError, setResolveError] = useState('');
    const [resolveSuccess, setResolveSuccess] = useState(false);

    const handleResolve = async () => {
        setResolving(true);
        setResolveError('');
        try {
            const payload = machine.openDowntimeId
                ? { action: 'end', downtimeEventId: machine.openDowntimeId, resolutionNotes: resolveNotes || 'Issue resolved by operator' }
                : { action: 'recover-machine', machineId: machine.id, resolutionNotes: resolveNotes || 'Recovered by operator' };

            const res = await fetch('/api/downtime', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                setResolveSuccess(true);
                setTimeout(() => { onResolved(); onClose(); }, 1800);
            } else {
                const err = await res.json();
                setResolveError(err.error ?? 'Failed to resolve. Try again.');
            }
        } catch {
            setResolveError('Network error. Check connection and try again.');
        } finally {
            setResolving(false);
        }
    };

    return (
        <div style={{
            width: '300px', flexShrink: 0,
            background: 'var(--card-bg)',
            border: `1px solid ${isDown ? 'rgba(220,38,38,0.4)' : 'var(--card-border)'}`,
            borderRadius: '1rem', padding: '1.5rem', overflowY: 'auto',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: '1rem' }}>{machine.code}</h3>
                <button
                    type="button"
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '1.1rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}
                >
                    ✕
                </button>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>{machine.name}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '0.5rem', marginBottom: '1.25rem' }}>
                {cfg.icon}
                <span style={{ color: cfg.color, fontWeight: 700, fontSize: '0.85rem' }}>{cfg.label}</span>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OEE</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: oeeColor }}>
                    {machine.oee > 0 ? `${machine.oee}%` : '—'}
                </div>
                <div style={{ height: '5px', background: 'var(--surface-muted)', borderRadius: '3px', marginTop: '0.4rem' }}>
                    <div style={{ width: `${machine.oee}%`, height: '100%', background: oeeColor, borderRadius: '3px', transition: 'width 0.6s' }} />
                </div>
            </div>

            {machine.currentJob && (
                <div style={{ marginBottom: '1.25rem', padding: '0.65rem', background: 'rgba(103,232,249,0.06)', border: '1px solid rgba(103,232,249,0.15)', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Job</div>
                    <div style={{ fontSize: '0.85rem', color: '#67e8f9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle size={12} /> {machine.currentJob}
                    </div>
                </div>
            )}

            {machine.lineName && (
                <div style={{ marginBottom: '1.25rem', padding: '0.65rem', background: 'var(--surface-muted)', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--foreground)', fontWeight: 600 }}>{machine.lineName}</div>
                    {machine.areaName && <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>{machine.areaName}</div>}
                </div>
            )}

            {isDown && (
                <div style={{ marginBottom: '1.25rem', padding: '1rem', background: resolveSuccess ? 'rgba(16,185,129,0.08)' : 'rgba(220,38,38,0.06)', border: `1px solid ${resolveSuccess ? '#10b981' : 'rgba(220,38,38,0.3)'}`, borderRadius: '0.75rem' }}>
                    {resolveSuccess ? (
                        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                            <CheckCircle size={28} color="#10b981" style={{ marginBottom: '0.5rem' }} />
                            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '0.95rem' }}>Machine Resolved</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>Closing panel...</div>
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                                Machine Stopped
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '2px' }}>
                                {machine.openDowntimeReason ?? 'Reason not recorded'}
                            </div>
                            {machine.openDowntimeMins !== undefined && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
                                    Down for: {machine.openDowntimeMins > 60
                                        ? `${Math.floor(machine.openDowntimeMins / 60)}h ${machine.openDowntimeMins % 60}m`
                                        : `${machine.openDowntimeMins} min`}
                                </div>
                            )}
                            <textarea
                                value={resolveNotes}
                                onChange={e => setResolveNotes(e.target.value)}
                                placeholder="What was done to fix it? (optional)"
                                rows={2}
                                style={{ width: '100%', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--surface-muted)', padding: '6px 8px', fontSize: '0.82rem', color: 'var(--foreground)', resize: 'none', marginBottom: '0.6rem' }}
                            />
                            {resolveError && (
                                <div style={{ color: '#dc2626', fontSize: '0.78rem', marginBottom: '0.5rem' }}>{resolveError}</div>
                            )}
                            <button
                                type="button"
                                disabled={resolving}
                                onClick={handleResolve}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: resolving ? '#9ca3af' : '#10b981', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: resolving ? 'not-allowed' : 'pointer' }}
                            >
                                {resolving ? 'Resolving...' : 'Machine Fixed — Back Online'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {machine.telemetry.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: machine.status === 'RUNNING' ? '#10b981' : '#94a3b8', display: 'inline-block' }} />
                        Live Signals
                    </div>
                    {machine.telemetry.map((t, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid var(--card-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                {SIGNAL_ICONS[t.signal] ?? <Gauge size={11} />}
                                {t.signal.replace(/_/g, ' ')}
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: parseFloat(t.value) > 0 ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                                {parseFloat(t.value) > 0 ? parseFloat(t.value).toFixed(1) : '—'}
                                <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: '0.25rem' }}>{t.unit ?? ''}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '1.25rem', padding: '0.65rem', background: 'var(--surface-muted)', borderRadius: '0.5rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This Shift</div>
                {[
                    { label: 'Parts Produced', value: '0' },
                    { label: 'Downtime',        value: machine.openDowntimeMins ? `${machine.openDowntimeMins} min` : '0 min' },
                    { label: 'Shift OEE',       value: machine.oee > 0 ? `${machine.oee}%` : 'N/A — no telemetry' },
                ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>{r.label}</span>
                        <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{r.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── KPI strip ────────────────────────────────────────────────────────────────

function KpiStrip({ machines }: { machines: MachineLive[] }) {
    const running = machines.filter(m => m.status === 'RUNNING').length;
    const total   = machines.length;
    const avgOee  = machines.filter(m => m.oee > 0).reduce((s, m) => s + m.oee, 0) / Math.max(1, machines.filter(m => m.oee > 0).length);

    return (
        <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 2rem', background: 'var(--surface-muted)', borderBottom: '1px solid var(--card-border)', flexWrap: 'wrap' }}>
            {[
                { label: 'Machines Online', value: `${running} / ${total}`,                                                   color: '#10b981' },
                { label: 'Avg OEE',         value: avgOee > 0 ? `${Math.round(avgOee)}%` : '—',                               color: avgOee >= 85 ? '#10b981' : avgOee >= 65 ? '#f59e0b' : '#ef4444' },
                { label: 'Running',         value: String(running),                                                            color: '#10b981' },
                { label: 'Idle',            value: String(machines.filter(m => m.status === 'IDLE').length),                   color: 'var(--muted-foreground)' },
                { label: 'Down',            value: String(machines.filter(m => m.status === 'DOWN').length),                   color: '#ef4444' },
                { label: 'Maintenance',     value: String(machines.filter(m => m.status === 'MAINTENANCE').length),            color: '#f59e0b' },
            ].map(k => (
                <div key={k.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px' }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: k.color }}>{k.value}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>{k.label}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FactoryMapPage() {
    const [tree, setTree]                     = useState<FactoryTree | null>(null);
    const [loading, setLoading]               = useState(true);
    const [selectedMachine, setSelectedMachine] = useState<MachineLive | null>(null);
    const selectedMachineRef                  = useRef<MachineLive | null>(null);
    const [lastRefresh, setLastRefresh]       = useState<Date | null>(null);
    const [liveConnected, setLiveConnected]   = useState(false);
    const esRef                               = useRef<EventSource | null>(null);

    const selectMachine = useCallback((m: MachineLive | null) => {
        selectedMachineRef.current = m;
        setSelectedMachine(m);
    }, []);

    const refresh = useCallback(async () => {
        try {
            const t = await fetchFactoryTree();
            setTree(t);
            setLastRefresh(new Date());
            if (selectedMachineRef.current && t) {
                const updated = [...t.areas.flatMap(a => a.lines.flatMap(l => l.machines)), ...t.ungrouped]
                    .find(m => m.id === selectedMachineRef.current!.id);
                if (updated) {
                    selectedMachineRef.current = updated;
                    setSelectedMachine(updated);
                }
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        const es = new EventSource('/api/stream');
        esRef.current = es;
        es.onopen  = () => setLiveConnected(true);
        es.onerror = () => setLiveConnected(false);
        es.onmessage = (evt) => {
            try {
                const event = JSON.parse(evt.data);
                if (event.type === 'machine.status.changed') refresh();
            } catch { /* ignore malformed events */ }
        };
        return () => { es.close(); setLiveConnected(false); };
    }, [refresh]);

    const allMachines = [
        ...(tree?.areas.flatMap(a => a.lines.flatMap(l => l.machines)) ?? []),
        ...(tree?.ungrouped ?? []),
    ];

    return (
        <div style={{ background: 'var(--background)', height: '100vh', color: 'var(--foreground)', display: 'flex', flexDirection: 'column' }}>

            {/* ── Header ── */}
            <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Factory size={22} color="#67e8f9" />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--foreground)' }}>Digital Factory Map</h1>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>
                            {tree ? `${tree.enterprise} › ${tree.plant}` : 'Loading...'}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: liveConnected ? '#10b981' : '#94a3b8' }}>
                        {liveConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
                        {liveConnected ? 'Live' : 'Offline'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted-foreground)' }}>
                        <Clock size={12} /> {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}
                    </div>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        style={{ background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: '0.4rem', padding: '0.35rem 0.75rem', color: 'var(--foreground)', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                    >
                        <RefreshCw size={12} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ── KPI strip ── */}
            {!loading && allMachines.length > 0 && <KpiStrip machines={allMachines} />}

            {/* ── Body ── */}
            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
                    Loading factory data...
                </div>
            ) : allMachines.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', maxWidth: '360px' }}>
                        <Factory size={40} color="#475569" style={{ marginBottom: '1rem' }} />
                        <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--foreground)', margin: '0 0 0.5rem' }}>No machines configured</p>
                        <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
                            Connect machines via{' '}
                            <Link href="/settings/connectors" style={{ color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Plug size={12} /> Machine Connections
                            </Link>
                            {' '}to see the live factory layout.
                        </p>
                        <Link
                            href="/settings/connectors"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.25rem', background: '#3b82f6', color: '#fff', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}
                        >
                            <Plug size={14} /> Configure Connections
                        </Link>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flex: 1, gap: '1.5rem', padding: '1.5rem 2rem', overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {(tree?.areas ?? []).map(area => (
                            <AreaSection
                                key={area.name}
                                area={area}
                                selectedId={selectedMachine?.id ?? null}
                                onSelect={selectMachine}
                            />
                        ))}

                        {(tree?.ungrouped ?? []).length > 0 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ color: '#64748b', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Unassigned Machines
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                                    {(tree?.ungrouped ?? []).map(m => (
                                        <MachineCard key={m.id} machine={m} selected={selectedMachine?.id === m.id} onSelect={() => selectMachine(m)} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedMachine && (
                        <DetailPanel
                            machine={selectedMachine}
                            onClose={() => selectMachine(null)}
                            onResolved={refresh}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
