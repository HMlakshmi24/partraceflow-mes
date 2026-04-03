'use client';

import styles from './Dashboard.module.css';
import OEEGauge from '@/components/dashboard/OEEGauge';
import ParetoChart from '@/components/dashboard/ParetoChart';
import HourByHourChart from '@/components/dashboard/HourByHourChart';
import WorkCenterTable from '@/components/dashboard/WorkCenterTable';
import StopsCounter from '@/components/dashboard/StopsCounter';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, Activity } from 'lucide-react';
import { MachineStatus } from '@/lib/types';

interface OpenStop {
    machineId: string;
    machineName: string;
    reason: string;
    description: string;
    startTime: string;
}

interface ActiveDown {
    id: string;
    downtimeEventId?: string;
    name: string;
    reason: string;
    since: string;
    durationMins: number;
}

interface DashboardData {
    oee: { oee: number; availability: number; performance: number; quality: number; stops: number };
    machines: MachineStatus[];
    downtime: { label: string; value: number; color: string }[];
    scrap: { label: string; value: number; color: string }[];
    production: { hour: string; actual: number; target: number }[];
    stopsByMachine?: { id: string; name: string; count: number; minutes: number }[];
    activeDown?: ActiveDown[];
    openStops: OpenStop[];
    summary: {
        activeOrders: number;
        openDowntimes: number;
        failedQc: number;
        runningMachines: number;
        totalMachines: number;
    };
    andon: {
        activeCount: number;
        criticalCount: number;
        alerts: { id: string; color: string; message: string; severity: string; reason: string; boardName: string; timestamp: string; machineId: string | null }[];
    };
}

function toStatusKey(raw: string): MachineStatus['status'] {
    const s = raw.toLowerCase();
    if (s === 'running') return 'running';
    if (s === 'down') return 'down';
    if (s === 'maintenance') return 'warning';
    return 'stopped';
}

const FALLBACK: DashboardData = {
    oee: { oee: 0, availability: 0, performance: 0, quality: 0, stops: 0 },
    machines: [], downtime: [], scrap: [], production: [], openStops: [],
    summary: { activeOrders: 0, openDowntimes: 0, failedQc: 0, runningMachines: 0, totalMachines: 0 },
    andon: { activeCount: 0, criticalCount: 0, alerts: [] },
};

// Deterministic production curve — no Math.random to avoid hydration mismatch
const DEMO_PROD = [285, 310, 298, 325, 342, 318, 305, 330, 316, 298, 322, 335, 308, 295, 318, 340];

function buildProductionTimeline(hoursBack: number): { hour: string; actual: number; target: number }[] {
    const slots: { hour: string; actual: number; target: number }[] = [];
    const now = new Date();
    const step = Math.max(1, Math.floor(hoursBack / 8));
    let idx = 0;
    for (let i = hoursBack; i >= 0; i -= step) {
        const t = new Date(now.getTime() - i * 3600000);
        const label = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        // Deterministic variation: ramp up early, plateau in mid-shift, slight dip at end
        const base = DEMO_PROD[idx % DEMO_PROD.length] ?? 300;
        const rampFactor = idx < 2 ? 0.6 + idx * 0.2 : 1;
        const actual = Math.round(base * rampFactor);
        slots.push({ hour: label, actual, target: 350 });
        idx++;
    }
    return slots;
}

async function fetchLegacyDashboard(period: string): Promise<DashboardData> {
    const hoursMap: Record<string, number> = { day: 8, week: 168, shift: 8 };
    const hours = hoursMap[period] ?? 8;

    const [machinesRes, oeeRes, downtimeRes] = await Promise.allSettled([
        fetch('/api/machines'),
        fetch(`/api/oee?hours=${hours}`),
        fetch('/api/downtime?action=history&limit=200'),
    ]);

    const machinesData = machinesRes.status === 'fulfilled' && machinesRes.value.ok
        ? await machinesRes.value.json() : { machines: [] };

    const oeeData = oeeRes.status === 'fulfilled' && oeeRes.value.ok
        ? await oeeRes.value.json() : { machines: [] };

    const downtimeData = downtimeRes.status === 'fulfilled' && downtimeRes.value.ok
        ? await downtimeRes.value.json() : { events: [] };

    // Build machine status list
    const machineMap: Record<string, any> = {};
    for (const m of (machinesData.machines ?? [])) {
        machineMap[m.id] = m;
    }

    const machines: MachineStatus[] = (oeeData.machines ?? []).map((o: any) => {
        const m = machineMap[o.machineId] ?? {};
        return {
            id: o.machineId,
            name: m.name ?? m.code ?? o.machineId.slice(0, 8),
            oee: Math.round(o.oee ?? m.oee ?? 0),
            availability: Math.round(o.availability ?? 0),
            performance: Math.round(o.performance ?? 0),
            quality: Math.round(o.quality ?? 0),
            goodQuantity: o.goodQuantity ?? 0,
            scrapQuantity: o.scrapQuantity ?? 0,
            status: toStatusKey(m.status ?? 'IDLE'),
        };
    });

    // If oee returned nothing but machines exist, build from machine list
    if (machines.length === 0 && (machinesData.machines ?? []).length > 0) {
        for (const m of machinesData.machines) {
            const sk = toStatusKey(m.status ?? 'IDLE');
            machines.push({
                id: m.id, name: m.name ?? m.code,
                oee: Math.round(m.oee ?? 0),
                availability: Math.round(m.oee ? Math.min(99, (m.oee ?? 0) * 1.1) : 0),
                performance: Math.round(m.oee ? Math.min(99, (m.oee ?? 0) * 1.05) : 0),
                quality: Math.round(m.oee ? Math.min(99, (m.oee ?? 0) * 1.15) : 0),
                goodQuantity: 0,
                scrapQuantity: 0,
                status: sk,
            });
        }
    }

    // Aggregate OEE
    const running = machines.filter(m => m.status === 'running' || m.status === 'warning');
    const avgOee = running.length ? Math.round(running.reduce((s, m) => s + m.oee, 0) / running.length) : 0;
    const avgAvail = running.length ? Math.round(running.reduce((s, m) => s + m.availability, 0) / running.length) : 0;
    const avgPerf = running.length ? Math.round(running.reduce((s, m) => s + m.performance, 0) / running.length) : 0;
    const avgQual = running.length ? Math.round(running.reduce((s, m) => s + m.quality, 0) / running.length) : 0;

    // Build downtime pareto
    const dtEvents: any[] = downtimeData.events ?? downtimeData ?? [];
    const dtMap: Record<string, number> = {};
    for (const ev of dtEvents) {
        const label = ev.reason?.name ?? ev.reasonName ?? 'Unclassified';
        dtMap[label] = (dtMap[label] ?? 0) + (ev.durationMinutes ?? 15);
    }
    const downtime = Object.entries(dtMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label, value: Math.round(value), color: '#d32f2f' }));

    if (downtime.length === 0) {
        downtime.push(
            { label: 'Mechanical Breakdown', value: 45, color: '#d32f2f' },
            { label: 'Preventive Maintenance', value: 30, color: '#d32f2f' },
            { label: 'Material Shortage', value: 18, color: '#d32f2f' },
            { label: 'Setup / Changeover', value: 12, color: '#d32f2f' },
        );
    }

    // Scrap pareto (static for now — extend with real quality data)
    const scrap = [
        { label: 'Dimensional Error', value: 28, color: '#ff5722' },
        { label: 'Surface Defect', value: 15, color: '#ff5722' },
        { label: 'Bad Weld', value: 9, color: '#ff5722' },
        { label: 'Discolored', value: 6, color: '#ff5722' },
    ];

    const production = buildProductionTimeline(hours > 24 ? 24 : hours);

    const openStops: OpenStop[] = dtEvents
        .filter((ev: any) => !ev.endTime)
        .map((ev: any) => ({
            machineId: ev.machineId ?? '',
            machineName: machineMap[ev.machineId]?.name ?? machineMap[ev.machineId]?.code ?? 'Unknown Machine',
            reason: ev.reason?.name ?? 'No reason recorded',
            description: ev.notes ?? '',
            startTime: ev.startTime ?? '',
        }));

    const stops = openStops.length;

    return {
        oee: { oee: avgOee, availability: avgAvail, performance: avgPerf, quality: avgQual, stops },
        machines,
        downtime,
        scrap,
        production,
        openStops,
        summary: { activeOrders: 0, openDowntimes: 0, failedQc: 0, runningMachines: 0, totalMachines: 0 },
        andon: { activeCount: 0, criticalCount: 0, alerts: [] },
    };
}

async function fetchLiveDashboard(period: string): Promise<DashboardData> {
    try {
        const res = await fetch(`/api/dashboard?period=${period}`);
        if (res.ok) {
            return await res.json();
        }
    } catch {
        // fall through
    }
    return fetchLegacyDashboard(period);
}

// ── Machine status tile helpers ────────────────────────────────────────────────

function getMachineStatusLabel(status: MachineStatus['status']): string {
    if (status === 'running') return 'Machine is Running';
    if (status === 'down') return 'Machine is DOWN';
    if (status === 'warning') return 'Under Maintenance';
    return 'Machine is Idle';
}

function getMachineStatusColor(status: MachineStatus['status']): string {
    if (status === 'running') return '#10b981';
    if (status === 'down') return '#ef4444';
    if (status === 'warning') return '#f59e0b';
    return '#64748b';
}

function getMachineTileClass(status: MachineStatus['status']): string {
    if (status === 'running') return styles.machineTile + ' ' + styles['machineTile--running'];
    if (status === 'down') return styles.machineTile + ' ' + styles['machineTile--down'];
    if (status === 'warning') return styles.machineTile + ' ' + styles['machineTile--maintenance'];
    return styles.machineTile + ' ' + styles['machineTile--idle'];
}

// ── Main Dashboard Component ───────────────────────────────────────────────────

function DashboardContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const period = searchParams.get('period') || 'day';

    const [data, setData] = useState<DashboardData>(FALLBACK);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [, setLastRefresh] = useState<Date | null>(null);
    const [liveConnected, setLiveConnected] = useState(false);
    const [showStopsPanel, setShowStopsPanel] = useState(false);
    const [resolveTarget, setResolveTarget] = useState<ActiveDown | null>(null);
    const [resolveNotes, setResolveNotes] = useState('');
    const [resolving, setResolving] = useState(false);
    const [resolveError, setResolveError] = useState('');
    const [resolveSuccess, setResolveSuccess] = useState(false);
    const [triggeringDemo, setTriggeringDemo] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const eventSourceRef = useRef<EventSource | null>(null);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async () => {
        try {
            const d = await fetchLiveDashboard(period);
            setData(d);
            setLastRefresh(new Date());
        } catch (e) {
            console.error('[Dashboard] fetch failed', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period]);

    const handleManualRefresh = useCallback(() => {
        setRefreshing(true);
        refresh();
    }, [refresh]);

    // Update clock every minute
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    // Initial load + periodic refresh every 15s
    useEffect(() => {
        setLoading(true);
        refresh();
        refreshTimerRef.current = setInterval(refresh, 15000);
        return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
    }, [refresh]);

    // SSE live updates
    useEffect(() => {
        const es = new EventSource('/api/stream');
        eventSourceRef.current = es;

        es.onopen = () => setLiveConnected(true);
        es.onerror = () => setLiveConnected(false);

        es.onmessage = (evt) => {
            try {
                const event = JSON.parse(evt.data);
                if (event.type === 'machine.status.changed'
                    || event.type === 'machine.telemetry.received'
                    || event.type?.startsWith('andon.')
                    || event.type?.startsWith('downtime.')
                    || event.type?.startsWith('quality.')) {
                    refresh();
                }
            } catch { /* ignore malformed events */ }
        };

        return () => { es.close(); setLiveConnected(false); };
    }, [refresh]);

    const setPeriod = (p: string) => router.push(`/dashboard?period=${p}`);
    const oeeColor = (v: number) => v >= 85 ? '#10b981' : v >= 65 ? '#f59e0b' : '#ef4444';

    const runningCount = data.machines.filter(m => m.status === 'running').length;
    const downCount = data.machines.filter(m => m.status === 'down').length;
    const maintenanceCount = data.machines.filter(m => m.status === 'warning').length;
    const idleCount = data.machines.filter(m => m.status === 'stopped').length;
    const liveDownCount = data.activeDown?.length ?? 0;

    return (
        <div className={styles.dashboard}>

            {/* ── Page Header ──────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                        Live Factory Dashboard
                    </h1>
                    <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                        &nbsp;&nbsp;{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {/* Period buttons */}
                    {(['day', 'shift', 'week'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)} style={{
                            minHeight: '38px',
                            padding: '0.4rem 1.1rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
                            fontWeight: 700, fontSize: '0.85rem',
                            background: period === p ? '#1e40af' : 'var(--card-border)',
                            color: period === p ? '#fff' : 'var(--foreground)',
                            transition: 'all 0.15s',
                        }}>
                            {p === 'day' ? 'Today' : p === 'shift' ? 'This Shift' : 'This Week'}
                        </button>
                    ))}

                    {/* Live indicator */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                        {liveConnected
                            ? <><Wifi size={13} color="#10b981" /><span style={{ color: '#10b981', fontWeight: 600 }}>Live</span></>
                            : <><WifiOff size={13} color="#9ca3af" /><span style={{ color: '#9ca3af' }}>Polling</span></>}
                    </span>

                    {/* Refresh button */}
                    <button onClick={handleManualRefresh} disabled={refreshing} style={{
                        minHeight: '38px',
                        background: 'none', border: '1px solid var(--card-border)', borderRadius: '0.5rem',
                        padding: '0.35rem 0.75rem', cursor: refreshing ? 'not-allowed' : 'pointer',
                        color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.3rem',
                        fontWeight: 600, fontSize: '0.82rem',
                    }}>
                        <RefreshCw size={13} style={refreshing ? { animation: 'spin 0.7s linear infinite' } : {}} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>

                    {/* Stops & Damage — toggles inline resolve panel, or demo trigger when no downs */}
                    {liveDownCount === 0 ? (
                        <button
                            onClick={async () => {
                                setTriggeringDemo(true);
                                try {
                                    // Find first available machine
                                    const firstMachine = data.machines[0];
                                    if (firstMachine) {
                                        await fetch('/api/downtime', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                action: 'start',
                                                machineId: firstMachine.id,
                                                reason: 'Machine Breakdown',
                                                notes: 'Demo stop — triggered for demonstration',
                                            }),
                                        });
                                        await refresh();
                                    }
                                } catch { /* ignore */ }
                                finally { setTriggeringDemo(false); }
                            }}
                            disabled={triggeringDemo}
                            style={{
                                minHeight: '38px',
                                background: 'none',
                                border: '1px solid var(--card-border)',
                                borderRadius: '0.5rem', padding: '0.35rem 0.85rem', cursor: triggeringDemo ? 'not-allowed' : 'pointer',
                                color: 'var(--muted-foreground)',
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                fontWeight: 600, fontSize: '0.82rem',
                                opacity: triggeringDemo ? 0.7 : 1,
                            }}
                        >
                            <AlertTriangle size={13} />
                            {triggeringDemo ? 'Triggering...' : 'Demo: Trigger a Stop'}
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowStopsPanel(v => !v)}
                            style={{
                                minHeight: '38px',
                                background: '#dc2626',
                                border: '2px solid #b91c1c',
                                borderRadius: '0.5rem', padding: '0.35rem 0.85rem', cursor: 'pointer',
                                color: '#fff',
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                fontWeight: 700, fontSize: '0.85rem',
                                animation: 'pulse-banner 1.4s ease-in-out infinite',
                            }}
                        >
                            <AlertTriangle size={14} />
                            Stops &amp; Damage
                            <span style={{ background: 'rgba(255,255,255,0.3)', color: '#fff', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, padding: '0.05rem 0.45rem', minWidth: '1.2rem', textAlign: 'center' as const }}>
                                {liveDownCount}
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Critical Alert Banner — only when machines are REALLY down ── */}
            {!loading && liveDownCount > 0 && (
                <div style={{
                    background: '#dc2626', borderRadius: '10px', padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: '14px',
                    animation: 'pulse-banner 1.2s ease-in-out infinite',
                    boxShadow: '0 0 0 4px rgba(220,38,38,0.25)',
                }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                            FACTORY ALERT — {liveDownCount} Machine{liveDownCount > 1 ? 's' : ''} Currently DOWN
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500, fontSize: '0.88rem', marginTop: '2px' }}>
                            Select a machine below to resolve the stoppage
                        </div>
                    </div>
                    <Link href="/factory-map" style={{ color: '#fff', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.06em', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '8px 16px', flexShrink: 0, textDecoration: 'none' }}>
                        RESOLVE →
                    </Link>
                </div>
            )}

            {/* ── Inline Stops Panel — lists DOWN machines with one-click resolve ── */}
            {showStopsPanel && !loading && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: liveDownCount > 0 ? '#dc2626' : '#10b981', display: 'inline-block', animation: liveDownCount > 0 ? 'pulse 1.5s infinite' : 'none' }} />
                            {liveDownCount > 0 ? `${liveDownCount} Machine${liveDownCount > 1 ? 's' : ''} Currently Stopped` : 'All machines running — no active stops'}
                        </div>
                        <button onClick={() => setShowStopsPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
                    </div>
                    {liveDownCount === 0 ? (
                        <div style={{ fontSize: '0.9rem', color: '#16a34a', padding: '0.6rem 0.85rem', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px' }}>
                            No open stoppages right now. Dashboard will update automatically.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.6rem' }}>
                            {(data.activeDown ?? []).map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--foreground)' }}>{m.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>
                                            {m.reason} · down {m.durationMins > 60 ? `${Math.floor(m.durationMins / 60)}h ${m.durationMins % 60}m` : `${m.durationMins} min`}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setResolveTarget(m); setResolveNotes(''); setResolveError(''); setResolveSuccess(false); setShowStopsPanel(false); }}
                                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}
                                    >
                                        Resolve ✓
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Loading State ─────────────────────────────────────────────────── */}
            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted-foreground)', fontSize: '1rem', gap: '0.75rem', flexDirection: 'column' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
                    <span style={{ fontWeight: 600 }}>Loading live factory data...</span>
                </div>
            ) : (
                <>
                    {/* ── Andon Alert Banner ──────────────────────────────────── */}
                    {data.andon.activeCount > 0 && (
                        <div className={styles.andonBanner}>
                            <div className={styles.andonHeader}>
                                <span className={styles.andonTitle}>Andon Alerts</span>
                                <span className={styles.andonCount}>
                                    {data.andon.activeCount} active
                                    {data.andon.criticalCount > 0 && ` · ${data.andon.criticalCount} critical`}
                                </span>
                                <a href="/andon" className={styles.andonLink}>Open Andon Board</a>
                            </div>
                            <div className={styles.andonList}>
                                {data.andon.alerts.slice(0, 3).map(a => (
                                    <div key={a.id} className={styles.andonItem} data-color={a.color}>
                                        <span className={styles.andonDot} data-color={a.color} />
                                        <div className={styles.andonText}>
                                            <div className={styles.andonMessage}>{a.message}</div>
                                            <div className={styles.andonMeta}>{a.reason} · {a.boardName}</div>
                                        </div>
                                        <div className={styles.andonTime}>{new Date(a.timestamp).toLocaleTimeString()}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── KPI Summary Row ──────────────────────────────────────── */}
                    <div className={styles.summaryRow}>
                        <Link href="/factory-map" className={styles.summaryCard} style={{
                            textDecoration: 'none', color: 'inherit',
                            borderLeftColor: '#10b981',
                        }}>
                            <div className={styles.summaryLabel}>Machines Running</div>
                            <div className={styles.summaryValue} style={{ color: '#10b981' }}>
                                {data.summary.runningMachines || runningCount}
                                {data.summary.totalMachines > 0 && (
                                    <span style={{ fontSize: '1.2rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                                        /{data.summary.totalMachines}
                                    </span>
                                )}
                            </div>
                            <div className={styles.summaryMeta}>Machines actively producing right now ↗</div>
                        </Link>

                        <Link href="/planner" className={styles.summaryCard} style={{
                            textDecoration: 'none', color: 'inherit',
                            borderLeftColor: '#3b82f6',
                        }}>
                            <div className={styles.summaryLabel}>Active Jobs</div>
                            <div className={styles.summaryValue} style={{ color: '#3b82f6' }}>
                                {data.summary.activeOrders}
                            </div>
                            <div className={styles.summaryMeta}>Work orders currently in progress ↗</div>
                        </Link>

                        <Link href="/andon" className={styles.summaryCard} style={{
                            textDecoration: 'none', color: 'inherit',
                            borderLeftColor: liveDownCount > 0 ? '#ef4444' : '#64748b',
                        }}>
                            <div className={styles.summaryLabel}>Machines Stopped</div>
                            <div className={styles.summaryValue} style={{ color: liveDownCount > 0 ? '#ef4444' : 'var(--foreground)' }}>
                                {data.summary.openDowntimes || downCount}
                            </div>
                            <div className={styles.summaryMeta}>
                                {liveDownCount > 0 ? 'Action required — see Live Alerts ↗' : 'No active stoppages right now ↗'}
                            </div>
                        </Link>

                        <Link href="/quality" className={styles.summaryCard} style={{
                            textDecoration: 'none', color: 'inherit',
                            borderLeftColor: data.summary.failedQc > 0 ? '#ef4444' : '#64748b',
                        }}>
                            <div className={styles.summaryLabel}>Failed Inspections</div>
                            <div className={styles.summaryValue} style={{ color: data.summary.failedQc > 0 ? '#ef4444' : 'var(--foreground)' }}>
                                {data.summary.failedQc}
                            </div>
                            <div className={styles.summaryMeta}>Quality checks that did not pass ↗</div>
                        </Link>
                    </div>

                    {/* ── Machine Status Board ─────────────────────────────────── */}
                    {data.machines.length > 0 && (
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '0.85rem', padding: '1rem 1.25rem', boxShadow: 'var(--shadow-soft)' }}>
                            {/* Section header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                                        Machine Status Board
                                    </h2>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                        What is happening right now on the factory floor
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {[
                                        { label: `${runningCount} Running`, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                                        { label: `${downCount} DOWN`, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
                                        { label: `${maintenanceCount} Maintenance`, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
                                        { label: `${idleCount} Idle`, color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
                                    ].map(s => (
                                        <span key={s.label} style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, color: s.color, background: s.bg }}>
                                            {s.label}
                                        </span>
                                    ))}
                                    <Link href="/factory-map" style={{ padding: '3px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', textDecoration: 'none' }}>
                                        Open Full Map →
                                    </Link>
                                </div>
                            </div>

                            {/* Machine tiles grid */}
                            <div className={styles.machineBoard}>
                                {data.machines.map(machine => {
                                    const statusColor = getMachineStatusColor(machine.status);
                                    const statusLabel = getMachineStatusLabel(machine.status);
                                    const activeDownInfo = (data.activeDown ?? []).find(d => d.id === machine.id);
                                    const isDown = machine.status === 'down';
                                    return (
                                        <div
                                            key={machine.id}
                                            className={getMachineTileClass(machine.status)}
                                            onClick={isDown ? () => { setResolveTarget(activeDownInfo ?? { id: machine.id, name: machine.name, reason: 'Unknown', since: new Date().toISOString(), durationMins: 0 }); setResolveNotes(''); setResolveError(''); setResolveSuccess(false); } : undefined}
                                            style={isDown ? { cursor: 'pointer' } : undefined}
                                            title={isDown ? 'Click to resolve this stoppage' : undefined}
                                        >
                                            {/* Machine name */}
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)', marginBottom: '6px' }}>
                                                {machine.name}
                                            </div>

                                            {/* Status badge */}
                                            <div style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                padding: '4px 10px', borderRadius: '999px',
                                                background: statusColor + '22',
                                                color: statusColor,
                                                fontSize: '0.75rem', fontWeight: 800,
                                                marginBottom: isDown ? '6px' : '0',
                                            }}>
                                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                                                {statusLabel}
                                            </div>

                                            {/* OEE for running machines */}
                                            {(machine.status === 'running' || machine.status === 'warning') && machine.oee > 0 && (
                                                <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                                                    OEE: <strong style={{ color: oeeColor(machine.oee) }}>{machine.oee}%</strong>
                                                </div>
                                            )}

                                            {/* Down reason + click hint */}
                                            {isDown && (
                                                <>
                                                    <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>
                                                        {activeDownInfo?.reason ?? 'Reason not recorded'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '6px', padding: '3px 8px', background: 'rgba(220,38,38,0.1)', borderRadius: '6px', display: 'inline-block', fontWeight: 700 }}>
                                                        Tap to Resolve →
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── OEE Performance Row ──────────────────────────────────── */}
                    <div>
                        <div style={{ marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={16} color="#3b82f6" />
                            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                                OEE Performance
                            </h2>
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>— How efficiently the factory is running</span>
                        </div>
                        <div className={styles.kpiRow}>
                            <div className={styles.kpiCard}>
                                <OEEGauge value={data.oee.oee} label="Overall Efficiency (OEE)" color={oeeColor(data.oee.oee)} />
                            </div>
                            <div className={styles.kpiCard}>
                                <OEEGauge value={data.oee.availability} label="Available Time %" color={oeeColor(data.oee.availability)} />
                            </div>
                            <div className={styles.kpiCard}>
                                <OEEGauge value={data.oee.performance} label="Running at Speed %" color={oeeColor(data.oee.performance)} />
                            </div>
                            <div className={styles.kpiCard}>
                                <OEEGauge value={data.oee.quality} label="Good Parts Made %" color={oeeColor(data.oee.quality)} />
                            </div>
                            <div className={styles.kpiCard}>
                                <StopsCounter
                                    count={data.activeDown?.length ?? 0}
                                    downtime={data.downtime}
                                    stopsByMachine={data.stopsByMachine ?? []}
                                    stoppedMachines={(data.activeDown ?? []).map(m => ({ id: m.id, name: m.name }))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Charts Row ────────────────────────────────────────────── */}
                    <div className={styles.mainGrid}>
                        <div className={styles.leftCol}>
                            <div className={styles.chartCard} style={{ flex: 1 }}>
                                <ParetoChart title="Top Reasons Machines Stopped" data={data.downtime} />
                            </div>
                            <div className={styles.chartCard} style={{ flex: 1, marginTop: '1rem' }}>
                                <ParetoChart title="Top Reasons for Scrap / Rework" data={data.scrap} />
                            </div>
                        </div>

                        <div className={styles.rightCol}>
                            <div className={styles.tableCard}>
                                {data.machines.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', background: 'var(--card-bg)', borderRadius: '0.75rem', border: '1px solid var(--card-border)' }}>
                                        <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>No machine data yet.</p>
                                        <p style={{ fontSize: '0.85rem' }}>
                                            Run the Demo Seed from <a href="/settings" style={{ color: '#3b82f6' }}>Settings</a> to populate factory data.
                                        </p>
                                    </div>
                                ) : (
                                    <WorkCenterTable machines={data.machines} />
                                )}
                            </div>
                            <div className={styles.timelineCard}>
                                <HourByHourChart data={data.production} />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Resolve Downtime Modal ──────────────────────────────────────── */}
            {resolveTarget && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setResolveTarget(null); setResolveSuccess(false); } }}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                    }}
                >
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '16px', padding: '1.75rem',
                        width: '100%', maxWidth: '460px', boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                        border: resolveSuccess ? '2px solid #10b981' : '2px solid rgba(220,38,38,0.4)',
                    }}>
                        {resolveSuccess ? (
                            /* ── Success state ── */
                            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#10b981', marginBottom: '0.4rem' }}>
                                    Machine Resolved!
                                </div>
                                <div style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                                    {resolveTarget.name} is back in service. Dashboard will update shortly.
                                </div>
                                <button onClick={() => { setResolveTarget(null); setResolveSuccess(false); }} style={{
                                    background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px',
                                    padding: '10px 28px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                                }}>
                                    Close
                                </button>
                            </div>
                        ) : (
                            /* ── Resolve form ── */
                            <>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--foreground)' }}>
                                            Resolve Machine Stoppage
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                                            Confirm the issue is fixed to bring this machine back online
                                        </div>
                                    </div>
                                    <button onClick={() => setResolveTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: '1.3rem', lineHeight: 1, padding: '0 4px' }}>×</button>
                                </div>

                                {/* Machine info */}
                                <div style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.1rem' }}>
                                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--foreground)', marginBottom: '4px' }}>
                                        {resolveTarget.name}
                                    </div>
                                    <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
                                            Reason: {resolveTarget.reason}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>
                                            Down for: {resolveTarget.durationMins > 60
                                                ? `${Math.floor(resolveTarget.durationMins / 60)}h ${resolveTarget.durationMins % 60}m`
                                                : `${resolveTarget.durationMins} min`}
                                        </div>
                                    </div>
                                </div>

                                {/* Resolution notes */}
                                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', color: 'var(--foreground)', marginBottom: '6px' }}>
                                    What was done to fix it? (optional)
                                </label>
                                <textarea
                                    value={resolveNotes}
                                    onChange={e => setResolveNotes(e.target.value)}
                                    placeholder="e.g. Replaced broken sensor, reset controller, cleared jam..."
                                    rows={3}
                                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--surface-muted)', padding: '0.6rem 0.8rem', fontSize: '0.9rem', color: 'var(--foreground)', resize: 'none', marginBottom: '1rem' }}
                                />

                                {resolveError && (
                                    <div style={{ color: '#dc2626', fontSize: '0.82rem', marginBottom: '0.75rem', padding: '8px 12px', background: 'rgba(220,38,38,0.07)', borderRadius: '8px' }}>
                                        {resolveError}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button onClick={() => setResolveTarget(null)} style={{
                                        flex: 1, padding: '11px', borderRadius: '10px',
                                        border: '1px solid var(--card-border)', background: 'none',
                                        color: 'var(--foreground)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                                    }}>
                                        Cancel
                                    </button>
                                    <button
                                        disabled={resolving}
                                        onClick={async () => {
                                            if (!resolveTarget.downtimeEventId) {
                                                setResolveError('No downtime event found for this machine. It may have already been resolved.');
                                                return;
                                            }
                                            setResolving(true);
                                            setResolveError('');
                                            try {
                                                const res = await fetch('/api/downtime', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        action: 'end',
                                                        downtimeEventId: resolveTarget.downtimeEventId,
                                                        resolutionNotes: resolveNotes || 'Issue resolved by operator',
                                                    }),
                                                });
                                                if (res.ok) {
                                                    setResolveSuccess(true);
                                                    refresh();
                                                } else {
                                                    const err = await res.json();
                                                    setResolveError(err.error ?? 'Failed to resolve. Try again.');
                                                }
                                            } catch {
                                                setResolveError('Network error. Check connection and try again.');
                                            } finally {
                                                setResolving(false);
                                            }
                                        }}
                                        style={{
                                            flex: 2, padding: '11px', borderRadius: '10px', border: 'none',
                                            background: resolving ? '#9ca3af' : '#10b981',
                                            color: '#fff', fontWeight: 800, fontSize: '0.95rem',
                                            cursor: resolving ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        }}
                                    >
                                        {resolving ? 'Resolving...' : '✓  Machine is Fixed — Back Online'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
                @keyframes pulse-btn {
                    0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
                    50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
                }
            `}</style>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted-foreground)' }}>Loading dashboard...</div>}>
            <DashboardContent />
        </Suspense>
    );
}
