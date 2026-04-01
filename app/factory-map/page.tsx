'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Factory, Activity, AlertTriangle, Wrench, Power, RefreshCw,
    Wifi, WifiOff, ChevronDown, ChevronRight, Zap, Thermometer, Gauge,
    CheckCircle, Clock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelemetryPoint { signal: string; value: string; unit: string | null }

interface MachineLive {
    id: string; code: string; name: string; status: string; oee: number;
    lineName: string; areaName: string; currentJob?: string;
    telemetry: TelemetryPoint[];
}

interface FactoryTree {
    enterprise: string; plant: string;
    areas: { name: string; lines: { name: string; machines: MachineLive[] }[] }[];
    ungrouped: MachineLive[];
}

// ─── Static config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
    RUNNING: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: '#10b981', icon: <Activity size={14} />, label: 'Running' },
    IDLE: { color: 'var(--muted-foreground)', bg: 'rgba(107,114,128,0.12)', border: 'var(--muted-foreground)', icon: <Power size={14} />, label: 'Idle' },
    DOWN: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', icon: <AlertTriangle size={14} />, label: 'Down' },
    MAINTENANCE: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', icon: <Wrench size={14} />, label: 'Maintenance' },
};

const SIGNAL_ICONS: Record<string, React.ReactNode> = {
    temperature: <Thermometer size={12} />,
    spindle_speed: <Gauge size={12} />,
    vibration: <Activity size={12} />,
    parts_counter: <Zap size={12} />,
    feed_rate: <Gauge size={12} />,
    current: <Zap size={12} />,
    pressure: <Gauge size={12} />,
};

// ─── Demo tree generator ──────────────────────────────────────────────────────
// Generates a realistic-looking factory map with live-jittering telemetry.
// Called on every refresh so values drift slightly, simulating live signals.

function jitter(base: number, pct = 0.04): string {
    const v = base * (1 + (Math.random() * 2 - 1) * pct);
    return v.toFixed(1);
}

function buildDemoTree(): FactoryTree {
    const mk = (
        id: string, code: string, name: string,
        status: string, oee: number,
        lineName: string, areaName: string,
        job: string | undefined,
        telemetry: TelemetryPoint[]
    ): MachineLive => ({ id, code, name, status, oee, lineName, areaName, currentJob: job, telemetry });

    // ── Area 1: CNC Machining Cell ──────────────────────────────────────────
    const w21 = mk('demo-w21', 'W21', 'CNC Milling Center', 'RUNNING', Math.round(Number(jitter(83))),
        'CNC Line 1', 'Machining Cell', 'WO-2026-001 · Gear Housing',
        [
            { signal: 'spindle_speed', value: jitter(7800, 0.03), unit: 'RPM' },
            { signal: 'temperature', value: jitter(58, 0.05), unit: '°C' },
            { signal: 'feed_rate', value: jitter(320, 0.06), unit: 'mm/min' },
            { signal: 'parts_counter', value: String(Math.floor(Math.random() * 3 + 137)), unit: 'ea' },
        ]);
    const w22 = mk('demo-w22', 'W22', 'CNC Turning Center', 'RUNNING', Math.round(Number(jitter(91))),
        'CNC Line 1', 'Machining Cell', 'WO-2026-003 · Shaft Assy',
        [
            { signal: 'spindle_speed', value: jitter(3200, 0.03), unit: 'RPM' },
            { signal: 'temperature', value: jitter(49, 0.04), unit: '°C' },
            { signal: 'vibration', value: jitter(2.4, 0.08), unit: 'mm/s' },
            { signal: 'parts_counter', value: String(Math.floor(Math.random() * 3 + 214)), unit: 'ea' },
        ]);
    const grnd = mk('demo-grnd', 'GRD-01', 'Surface Grinder', 'IDLE', 0,
        'CNC Line 2', 'Machining Cell', undefined,
        [
            { signal: 'spindle_speed', value: '0.0', unit: 'RPM' },
            { signal: 'temperature', value: jitter(24, 0.02), unit: '°C' },
        ]);
    const edm = mk('demo-edm', 'EDM-01', 'EDM Wire Cut', 'MAINTENANCE', 0,
        'CNC Line 2', 'Machining Cell', undefined,
        [
            { signal: 'temperature', value: jitter(30, 0.02), unit: '°C' },
            { signal: 'current', value: '0.0', unit: 'A' },
        ]);

    // ── Area 2: Assembly & Welding ──────────────────────────────────────────
    const asm = mk('demo-asm', 'ASM-01', 'Assembly Station A', 'RUNNING', Math.round(Number(jitter(78))),
        'Assembly Line A', 'Assembly & Welding', 'WO-2026-002 · Motor Housing',
        [
            { signal: 'parts_counter', value: String(Math.floor(Math.random() * 2 + 89)), unit: 'ea' },
            { signal: 'temperature', value: jitter(26, 0.03), unit: '°C' },
            { signal: 'vibration', value: jitter(1.1, 0.1), unit: 'mm/s' },
        ]);
    const wld = mk('demo-wld', 'WLD-01', 'Welding Robot MIG-5', 'RUNNING', Math.round(Number(jitter(88))),
        'Assembly Line A', 'Assembly & Welding', 'WO-2026-002 · Motor Housing',
        [
            { signal: 'temperature', value: jitter(74, 0.06), unit: '°C' },
            { signal: 'current', value: jitter(185, 0.04), unit: 'A' },
            { signal: 'parts_counter', value: String(Math.floor(Math.random() * 2 + 61)), unit: 'ea' },
        ]);
    const asm2 = mk('demo-asm2', 'ASM-02', 'Assembly Station B', 'IDLE', 0,
        'Assembly Line B', 'Assembly & Welding', undefined,
        [
            { signal: 'temperature', value: jitter(23, 0.02), unit: '°C' },
        ]);
    const press = mk('demo-press', 'PRS-01', 'Hydraulic Press 80T', 'DOWN', 0,
        'Assembly Line B', 'Assembly & Welding', undefined,
        [
            { signal: 'pressure', value: '0.0', unit: 'bar' },
            { signal: 'temperature', value: jitter(28, 0.03), unit: '°C' },
        ]);

    // ── Area 3: Quality & Packaging ─────────────────────────────────────────
    const cmm = mk('demo-cmm', 'QG-01', 'CMM Inspection Cell', 'RUNNING', Math.round(Number(jitter(96))),
        'QA Station', 'Quality & Packaging', 'WO-2026-001 · Final Inspect',
        [
            { signal: 'parts_counter', value: String(Math.floor(Math.random() * 2 + 52)), unit: 'ea' },
            { signal: 'temperature', value: jitter(20.2, 0.01), unit: '°C' }, // CMM needs controlled temp
            { signal: 'vibration', value: jitter(0.3, 0.1), unit: 'mm/s' },
        ]);
    const vis = mk('demo-vis', 'VIS-01', 'Vision Inspection', 'RUNNING', Math.round(Number(jitter(99))),
        'QA Station', 'Quality & Packaging', 'WO-2026-003 · Vision Check',
        [
            { signal: 'parts_counter', value: String(Math.floor(Math.random() * 3 + 310)), unit: 'ea' },
            { signal: 'temperature', value: jitter(22, 0.02), unit: '°C' },
        ]);
    const pkg = mk('demo-pkg', 'PKG-01', 'Packaging Line 1', 'RUNNING', Math.round(Number(jitter(85))),
        'Packaging', 'Quality & Packaging', 'WO-2026-005 · Final Pack',
        [
            { signal: 'parts_counter', value: String(Math.floor(Math.random() * 5 + 420)), unit: 'ea' },
            { signal: 'feed_rate', value: jitter(22, 0.05), unit: 'units/min' },
            { signal: 'temperature', value: jitter(25, 0.03), unit: '°C' },
        ]);

    return {
        enterprise: 'ParTraceflow Manufacturing Corp',
        plant: 'Bangalore Factory (PLANT-BLR)',
        areas: [
            {
                name: 'Machining Cell',
                lines: [
                    { name: 'CNC Line 1', machines: [w21, w22] },
                    { name: 'CNC Line 2', machines: [grnd, edm] },
                ],
            },
            {
                name: 'Assembly & Welding',
                lines: [
                    { name: 'Assembly Line A', machines: [asm, wld] },
                    { name: 'Assembly Line B', machines: [asm2, press] },
                ],
            },
            {
                name: 'Quality & Packaging',
                lines: [
                    { name: 'QA Station', machines: [cmm, vis] },
                    { name: 'Packaging', machines: [pkg] },
                ],
            },
        ],
        ungrouped: [],
    };
}

// ─── Fetch live tree from DB ──────────────────────────────────────────────────

async function fetchFactoryTree(): Promise<FactoryTree> {
    try {
        const res = await fetch('/api/machines');
        if (!res.ok) return buildDemoTree();
        const { machines } = await res.json();
        if (!machines || machines.length === 0) return buildDemoTree();

        // Get latest telemetry
        const telemetryMap: Record<string, any[]> = {};
        try {
            const tRes = await fetch('/api/machines/telemetry');
            if (tRes.ok) {
                const tData = await tRes.json();
                for (const t of tData.telemetry ?? []) {
                    if (!telemetryMap[t.machineId]) telemetryMap[t.machineId] = [];
                    telemetryMap[t.machineId].push(t);
                }
            }
        } catch { /* telemetry optional */ }

        const areaMap: Record<string, { name: string; lines: Record<string, { name: string; machines: MachineLive[] }> }> = {};
        const ungrouped: MachineLive[] = [];

        for (const m of machines) {
            const tele = (telemetryMap[m.id] ?? []).slice(0, 4).map((t: any) => ({
                signal: t.signalName ?? t.signal?.signalName ?? 'signal',
                value: t.value,
                unit: t.unit ?? t.signal?.unit ?? null,
            }));

            const machine: MachineLive = {
                id: m.id, code: m.code, name: m.name,
                status: m.status ?? 'IDLE',
                oee: Math.round(m.oee ?? 0),
                lineName: m.productionLine?.name ?? '',
                areaName: m.productionLine?.area?.name ?? '',
                telemetry: tele,
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

        // If DB has machines but none are in lines, fall back to demo tree + show DB machines as ungrouped
        if (areas.length === 0) {
            const demo = buildDemoTree();
            return { ...demo, ungrouped };
        }

        return {
            enterprise: 'ParTraceflow Manufacturing Corp',
            plant: 'Bangalore Factory (PLANT-BLR)',
            areas, ungrouped,
        };
    } catch {
        return buildDemoTree();
    }
}

// ─── MachineCard ─────────────────────────────────────────────────────────────

function MachineCard({ machine, selected, onSelect }: { machine: MachineLive; selected: boolean; onSelect: () => void }) {
    const cfg = STATUS_CONFIG[machine.status] ?? STATUS_CONFIG.IDLE;
    const oeeColor = machine.oee >= 85 ? '#10b981' : machine.oee >= 65 ? '#f59e0b' : machine.oee > 0 ? '#ef4444' : '#475569';

    return (
        <div onClick={onSelect} style={{
            background: selected ? cfg.bg : 'var(--card-bg)',
            border: `2px solid ${selected ? cfg.color : 'var(--card-border)'}`,
            borderRadius: '0.75rem', padding: '0.9rem',
            cursor: 'pointer', transition: 'all 0.18s',
            minWidth: '155px', maxWidth: '190px',
            boxShadow: 'var(--shadow-soft)',
        }}>
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

            {/* OEE bar */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.2rem' }}>
                    <span>OEE</span>
                    <span style={{ color: oeeColor, fontWeight: 700 }}>
                        {machine.oee > 0 ? `${machine.oee}%` : '—'}
                    </span>
                </div>
                <div style={{ height: '4px', background: 'var(--card-border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${machine.oee}%`, height: '100%', background: oeeColor, transition: 'width 0.6s' }} />
                </div>
            </div>

            {/* Telemetry chips */}
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
    const down = all.filter(m => m.status === 'DOWN').length;
    const maint = all.filter(m => m.status === 'MAINTENANCE').length;

    return (
        <div style={{ marginBottom: '1.75rem' }}>
            {/* Area header */}
            <button onClick={() => setOpen(!open)} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--foreground)', fontWeight: 700, fontSize: '0.95rem',
                marginBottom: '0.75rem', padding: 0,
            }}>
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{area.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 400 }}>({all.length} machines)</span>
                {running > 0 && <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontWeight: 600 }}>{running} running</span>}
                {down > 0 && <span style={{ fontSize: '0.68rem', background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontWeight: 600 }}>{down} down</span>}
                {maint > 0 && <span style={{ fontSize: '0.68rem', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontWeight: 600 }}>{maint} maint</span>}
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

function DetailPanel({ machine, onClose }: { machine: MachineLive; onClose: () => void }) {
    const cfg = STATUS_CONFIG[machine.status] ?? STATUS_CONFIG.IDLE;
    const oeeColor = machine.oee >= 85 ? '#10b981' : machine.oee >= 65 ? '#f59e0b' : machine.oee > 0 ? '#ef4444' : '#475569';

    return (
        <div style={{
            width: '300px', flexShrink: 0,
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: '1rem', padding: '1.5rem', overflowY: 'auto',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: '1rem' }}>{machine.code}</h3>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '1.1rem' }}>✕</button>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>{machine.name}</div>

            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '0.5rem', marginBottom: '1.25rem' }}>
                {cfg.icon}
                <span style={{ color: cfg.color, fontWeight: 700, fontSize: '0.85rem' }}>{cfg.label}</span>
            </div>

            {/* OEE */}
            <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OEE</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: oeeColor }}>
                    {machine.oee > 0 ? `${machine.oee}%` : '—'}
                </div>
                <div style={{ height: '5px', background: 'var(--surface-muted)', borderRadius: '3px', marginTop: '0.4rem' }}>
                    <div style={{ width: `${machine.oee}%`, height: '100%', background: oeeColor, borderRadius: '3px', transition: 'width 0.8s' }} />
                </div>
            </div>

            {/* Current job */}
            {machine.currentJob && (
                <div style={{ marginBottom: '1.25rem', padding: '0.65rem', background: 'rgba(103,232,249,0.06)', border: '1px solid rgba(103,232,249,0.15)', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Job</div>
                    <div style={{ fontSize: '0.85rem', color: '#67e8f9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle size={12} /> {machine.currentJob}
                    </div>
                </div>
            )}

            {/* Location */}
            {machine.lineName && (
                <div style={{ marginBottom: '1.25rem', padding: '0.65rem', background: 'var(--surface-muted)', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--foreground)', fontWeight: 600 }}>{machine.lineName}</div>
                    {machine.areaName && <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>{machine.areaName}</div>}
                </div>
            )}

            {/* Live signals */}
            {machine.telemetry.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: machine.status === 'RUNNING' ? 'pulse 1.5s infinite' : undefined }} />
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

            {/* Shift summary stub */}
            <div style={{ marginTop: '1.25rem', padding: '0.65rem', background: 'var(--surface-muted)', borderRadius: '0.5rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This Shift</div>
                {[
                    { label: 'Parts Produced', value: machine.status === 'RUNNING' ? String(Math.floor(Math.random() * 50 + 100)) : '—' },
                    { label: 'Downtime', value: machine.status === 'DOWN' ? '14 min' : '0 min' },
                    { label: 'Shift OEE', value: machine.oee > 0 ? `${machine.oee}%` : '—' },
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
    const total = machines.length;
    const avgOee = total ? Math.round(machines.filter(m => m.oee > 0).reduce((s, m) => s + m.oee, 0) / Math.max(1, machines.filter(m => m.oee > 0).length)) : 0;

    return (
        <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 2rem', background: 'var(--surface-muted)', borderBottom: '1px solid var(--card-border)', flexWrap: 'wrap' }}>
            {[
                { label: 'Machines Online', value: `${running} / ${total}`, color: '#10b981' },
                { label: 'Avg OEE', value: avgOee > 0 ? `${avgOee}%` : '—', color: avgOee >= 85 ? '#10b981' : avgOee >= 65 ? '#f59e0b' : '#ef4444' },
                { label: 'Running', value: String(running), color: '#10b981' },
                { label: 'Idle', value: String(machines.filter(m => m.status === 'IDLE').length), color: 'var(--muted-foreground)' },
                { label: 'Down', value: String(machines.filter(m => m.status === 'DOWN').length), color: '#ef4444' },
                { label: 'Maintenance', value: String(machines.filter(m => m.status === 'MAINTENANCE').length), color: '#f59e0b' },
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
    const [tree, setTree] = useState<FactoryTree>(() => buildDemoTree());
    const [loading, setLoading] = useState(false);
    const [selectedMachine, setSelectedMachine] = useState<MachineLive | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [liveConnected, setLiveConnected] = useState(false);
    const [usingDemoData, setUsingDemoData] = useState(true);
    const esRef = useRef<EventSource | null>(null);

    const refresh = useCallback(async () => {
        try {
            const t = await fetchFactoryTree();
            // Check if result is from DB (has real IDs) or demo
            const firstMachine = t.areas[0]?.lines[0]?.machines[0] ?? t.ungrouped[0];
            const isDemo = !firstMachine || firstMachine.id.startsWith('demo-');
            setUsingDemoData(isDemo);
            setTree(t);
            setLastRefresh(new Date());
            // Update selected machine telemetry if it's still visible
            if (selectedMachine) {
                const updated = [...t.areas.flatMap(a => a.lines.flatMap(l => l.machines)), ...t.ungrouped]
                    .find(m => m.id === selectedMachine.id);
                if (updated) setSelectedMachine(updated);
            }
        } catch (e) {
            console.error('[FactoryMap]', e);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-refresh demo data every 8 seconds to make telemetry "live"
    useEffect(() => {
        const timer = setInterval(refresh, 8000);
        return () => clearInterval(timer);
    }, [refresh]);

    // SSE live updates from real DB
    useEffect(() => {
        const es = new EventSource('/api/stream');
        esRef.current = es;
        es.onopen = () => setLiveConnected(true);
        es.onerror = () => setLiveConnected(false);
        es.onmessage = (evt) => {
            try {
                const event = JSON.parse(evt.data);
                if (event.type === 'machine.status.changed') refresh();
            } catch { /* ignore */ }
        };
        return () => { es.close(); setLiveConnected(false); };
    }, [refresh]);

    const allMachines = [
        ...tree.areas.flatMap(a => a.lines.flatMap(l => l.machines)),
        ...tree.ungrouped,
    ];

    return (
        <div style={{ background: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Factory size={22} color="#67e8f9" />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--foreground)' }}>Digital Factory Map</h1>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>
                            {tree.enterprise} › {tree.plant}
                        </div>
                    </div>
                    {usingDemoData && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(103,232,249,0.12)', color: '#67e8f9', border: '1px solid rgba(103,232,249,0.25)', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontWeight: 600 }}>
                            DEMO
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: liveConnected ? '#10b981' : '#94a3b8' }}>
                        {liveConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
                        {liveConnected ? 'Live DB' : (usingDemoData ? 'Demo Mode' : 'Polling')}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted-foreground)' }}>
                        <Clock size={12} /> {lastRefresh.toLocaleTimeString()}
                    </div>

                    <button onClick={refresh} disabled={loading} style={{
                        background: 'var(--surface-muted)', border: '1px solid var(--card-border)',
                        borderRadius: '0.4rem', padding: '0.35rem 0.75rem', color: 'var(--foreground)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem',
                    }}>
                        <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* KPI strip */}
            <KpiStrip machines={allMachines} />

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, gap: '1.5rem', padding: '1.5rem 2rem', overflow: 'hidden' }}>

                {/* Factory floor */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {usingDemoData && (
                        <div style={{ marginBottom: '1.25rem', padding: '0.65rem 1rem', background: 'rgba(103,232,249,0.05)', border: '1px solid rgba(103,232,249,0.15)', borderRadius: '0.65rem', fontSize: '0.78rem', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <Factory size={13} color="#67e8f9" />
                            Showing demo factory layout. Go to{' '}
                            <a href="/settings" style={{ color: '#67e8f9', fontWeight: 600 }}>Settings → Seed Factory Data</a>
                            {' '}to connect real DB machines.
                        </div>
                    )}

                    {tree.areas.map(area => (
                        <AreaSection
                            key={area.name}
                            area={area}
                            selectedId={selectedMachine?.id ?? null}
                            onSelect={setSelectedMachine}
                        />
                    ))}

                    {tree.ungrouped.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ color: '#64748b', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Unassigned Machines
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                                {tree.ungrouped.map(m => (
                                    <MachineCard key={m.id} machine={m} selected={selectedMachine?.id === m.id} onSelect={() => setSelectedMachine(m)} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Detail panel */}
                {selectedMachine && (
                    <DetailPanel
                        machine={selectedMachine}
                        onClose={() => setSelectedMachine(null)}
                    />
                )}
            </div>
        </div>
    );
}
