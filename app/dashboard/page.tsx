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
import { RefreshCw, Wifi, WifiOff, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
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

// Demo production values per time bucket — realistic shift curve
const DEMO_PROD = [0, 42, 178, 312, 341, 298, 356, 329, 347, 318, 301, 289];

function buildProductionTimeline(hoursBack: number): { hour: string; actual: number; target: number }[] {
    const slots: { hour: string; actual: number; target: number }[] = [];
    const now = new Date();
    const step = Math.max(1, Math.floor(hoursBack / 6));
    let idx = 0;
    for (let i = hoursBack; i >= 0; i -= step) {
        const t = new Date(now.getTime() - i * 3600000);
        const label = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const hour = t.getHours();
        const isWork = hour >= 6 && hour < 22;
        const actual = isWork ? (DEMO_PROD[idx % DEMO_PROD.length] ?? 0) : 0;
        slots.push({ hour: label, actual, target: isWork ? 350 : 0 });
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

function DashboardContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const period = searchParams.get('period') || 'day';

    const [data, setData] = useState<DashboardData>(FALLBACK);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [liveConnected, setLiveConnected] = useState(false);
    const [showStopsDamage, setShowStopsDamage] = useState(false);
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
                    // Debounce: just refresh data on significant events
                    refresh();
                }
            } catch { /* ignore malformed events */ }
        };

        return () => { es.close(); setLiveConnected(false); };
    }, [refresh]);

    const setPeriod = (p: string) => router.push(`/dashboard?period=${p}`);

    const oeeColor = (v: number) => v >= 85 ? '#388e3c' : v >= 65 ? '#fbc02d' : '#d32f2f';

    return (
        <div className={styles.dashboard}>
            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0 0.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['day', 'shift', 'week'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)} style={{
                            padding: '0.4rem 1rem', borderRadius: '0.4rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                            background: period === p ? '#1e40af' : 'var(--card-border)', color: period === p ? 'var(--card-bg)' : 'var(--foreground)',
                        }}>{p === 'day' ? 'Today' : p === 'shift' ? 'This Shift' : 'This Week'}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {liveConnected
                            ? <><Wifi size={14} color="#10b981" /> <span style={{ color: '#10b981' }}>Live</span></>
                            : <><WifiOff size={14} color="#9ca3af" /> <span>Polling</span></>
                        }
                    </span>
                    {lastRefresh && <span>Updated {lastRefresh.toLocaleTimeString()}</span>}
                    <button
                        onClick={handleManualRefresh}
                        disabled={refreshing}
                        style={{ background: refreshing ? '#eff6ff' : 'none', border: refreshing ? '1px solid #bfdbfe' : 'none', borderRadius: '0.4rem', padding: '0.3rem 0.6rem', cursor: refreshing ? 'not-allowed' : 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, transition: 'all 0.15s' }}>
                        <RefreshCw size={14} style={refreshing ? { animation: 'spin 0.7s linear infinite' } : {}} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    {(() => {
                        const liveCount = data.activeDown?.length ?? 0;
                        const hasLive = liveCount > 0;
                        return (
                            <button
                                onClick={() => setShowStopsDamage(v => !v)}
                                style={{
                                    background: hasLive ? 'rgba(239,68,68,0.12)' : showStopsDamage ? 'rgba(239,68,68,0.08)' : 'none',
                                    border: hasLive ? '1px solid rgba(239,68,68,0.5)' : showStopsDamage ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--card-border)',
                                    borderRadius: '0.4rem', padding: '0.3rem 0.7rem', cursor: 'pointer',
                                    color: hasLive || showStopsDamage ? '#dc2626' : 'var(--foreground)',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
                                    animation: hasLive && !showStopsDamage ? 'pulse-btn 1.4s ease-in-out infinite' : 'none',
                                }}>
                                <AlertTriangle size={14} />
                                Stops & Damage
                                {hasLive && (
                                    <span style={{ background: '#dc2626', color: '#fff', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, padding: '0.05rem 0.45rem', minWidth: '1.2rem', textAlign: 'center' }}>
                                        {liveCount}
                                    </span>
                                )}
                                {showStopsDamage ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                        );
                    })()}
                </div>
            </div>

            {/* Stops & Damage Panel */}
            {showStopsDamage && !loading && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--card-bg)', border: `1px solid ${(data.activeDown?.length ?? 0) > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.15)'}`, borderRadius: '0.75rem', padding: '1rem 1.25rem' }}>
                    {/* Stops list */}
                    <div>
                        {/* Live — currently stopped */}
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#dc2626', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block', animation: (data.activeDown?.length ?? 0) > 0 ? 'pulse 1.5s infinite' : 'none' }} />
                            Live — Machines Down Now
                        </div>
                        {(data.activeDown?.length ?? 0) === 0 ? (
                            <div style={{ fontSize: '0.85rem', color: '#16a34a', padding: '0.4rem 0.75rem', background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                                All machines running
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                                {(data.activeDown ?? []).map(m => (
                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--foreground)' }}>{m.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>{m.reason} · {m.durationMins}m ago</div>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '3px', padding: '0.1rem 0.45rem', flexShrink: 0 }}>DOWN</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Historical — closed stops this period */}
                        {data.downtime.length > 0 && (
                            <>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', margin: '0.9rem 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#94a3b8', display: 'inline-block' }} />
                                    Period History — Resolved Stops
                                </div>
                                <div style={{ display: 'grid', gap: '0.3rem' }}>
                                    {data.downtime.map((item, i) => (
                                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', width: '1.2rem', textAlign: 'right' as const }}>{i + 1}</span>
                                            <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.label}</span>
                                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{item.value} min</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Damage / Defect list */}
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c3aed', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#7c3aed', display: 'inline-block' }} />
                            Damage & Defects
                        </div>
                        {data.scrap.length === 0 ? (
                            <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', padding: '0.5rem 0' }}>No defects recorded.</div>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                                {data.scrap.map((item, i) => {
                                    const maxVal = data.scrap[0]?.value ?? 1;
                                    const pct = Math.round((item.value / maxVal) * 100);
                                    return (
                                        <div key={item.label} style={{ display: 'grid', gap: '0.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', width: '1.2rem', textAlign: 'right' as const }}>{i + 1}</span>
                                                <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.label}</span>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed' }}>{item.value} pcs</span>
                                            </div>
                                            <div style={{ marginLeft: '1.8rem', height: 4, background: 'var(--surface-muted)', borderRadius: 999, overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #7c3aed, #a78bfa)', borderRadius: 999, transition: 'width 0.4s' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div style={{ marginTop: '1rem', padding: '0.6rem 0.85rem', background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '0.5rem', fontSize: '0.82rem', color: 'var(--muted-foreground)' }}>
                            Total scrap pieces: <strong style={{ color: 'var(--foreground)' }}>{data.scrap.reduce((s, d) => s + d.value, 0)}</strong>
                            &nbsp;·&nbsp;Failed QC inspections: <strong style={{ color: 'var(--foreground)' }}>{data.summary.failedQc}</strong>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted-foreground)', fontSize: '1rem', gap: '0.75rem' }}>
                    <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading live factory data...
                </div>
            ) : (
                <>
                    {data.andon.activeCount > 0 && (
                        <div className={styles.andonBanner}>
                            <div className={styles.andonHeader}>
                                <span className={styles.andonTitle}>Andon Alerts</span>
                                <span className={styles.andonCount}>
                                    {data.andon.activeCount} active
                                    {data.andon.criticalCount > 0 && ` • ${data.andon.criticalCount} critical`}
                                </span>
                                <a href="/andon" className={styles.andonLink}>Open Andon Board</a>
                            </div>
                            <div className={styles.andonList}>
                                {data.andon.alerts.slice(0, 3).map(a => (
                                    <div key={a.id} className={styles.andonItem} data-color={a.color}>
                                        <span className={styles.andonDot} data-color={a.color} />
                                        <div className={styles.andonText}>
                                            <div className={styles.andonMessage}>{a.message}</div>
                                            <div className={styles.andonMeta}>
                                                {a.reason} • {a.boardName}
                                            </div>
                                        </div>
                                        <div className={styles.andonTime}>{new Date(a.timestamp).toLocaleTimeString()}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className={styles.summaryRow}>
                        <Link href="/planner" className={styles.summaryCard} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className={styles.summaryLabel}>Active Work Orders</div>
                            <div className={styles.summaryValue}>{data.summary.activeOrders}</div>
                            <div className={styles.summaryMeta}>Released + In Progress ↗</div>
                        </Link>
                        <Link href="/operator" className={styles.summaryCard} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className={styles.summaryLabel}>Open Downtime</div>
                            <div className={styles.summaryValue}>{data.summary.openDowntimes}</div>
                            <div className={styles.summaryMeta}>Requires attention ↗</div>
                        </Link>
                        <Link href="/quality" className={styles.summaryCard} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className={styles.summaryLabel}>Failed QC</div>
                            <div className={styles.summaryValue}>{data.summary.failedQc}</div>
                            <div className={styles.summaryMeta}>All-time failures ↗</div>
                        </Link>
                        <Link href="/factory-map" className={styles.summaryCard} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className={styles.summaryLabel}>Running Machines</div>
                            <div className={styles.summaryValue}>{data.summary.runningMachines}/{data.summary.totalMachines}</div>
                            <div className={styles.summaryMeta}>Live status ↗</div>
                        </Link>
                    </div>
                    {/* KPI Row */}
                    <div className={styles.kpiRow}>
                        <div className={styles.kpiCard}>
                            <OEEGauge value={data.oee.oee} label="OEE" color={oeeColor(data.oee.oee)} />
                        </div>
                        <div className={styles.kpiCard}>
                            <OEEGauge value={data.oee.availability} label="Availability" color={oeeColor(data.oee.availability)} />
                        </div>
                        <div className={styles.kpiCard}>
                            <OEEGauge value={data.oee.performance} label="Performance" color={oeeColor(data.oee.performance)} />
                        </div>
                        <div className={styles.kpiCard}>
                            <OEEGauge value={data.oee.quality} label="Quality" color={oeeColor(data.oee.quality)} />
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

                    {/* Main Content Grid */}
                    <div className={styles.mainGrid}>
                        <div className={styles.leftCol}>
                            <div className={styles.chartCard} style={{ flex: 1 }}>
                                <ParetoChart title="Downtime Pareto" data={data.downtime} />
                            </div>
                            <div className={styles.chartCard} style={{ flex: 1, marginTop: '1rem' }}>
                                <ParetoChart title="Scrap Pareto" data={data.scrap} />
                            </div>
                        </div>

                        <div className={styles.rightCol}>
                            <div className={styles.tableCard}>
                                {data.machines.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                        <p style={{ marginBottom: '0.5rem' }}>No machine data yet.</p>
                                        <p style={{ fontSize: '0.85rem' }}>Run the Demo Seed from <a href="/settings" style={{ color: '#3b82f6' }}>Settings</a> to populate factory data.</p>
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
