'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Bell, BellOff, Zap, Clock, User } from 'lucide-react';

interface AndonEvent {
    id: string;
    boardId: string;
    machineId?: string;
    machine?: { code: string; name: string };
    color: string;
    message: string;
    reason?: string;
    severity?: string;
    triggeredAt: string;
    acknowledgedAt?: string;
    resolvedAt?: string;
    triggeredBy?: string;
}

interface AndonBoard {
    id: string;
    name: string;
    isActive: boolean;
    displays: { id: string; zone: string; currentColor: string; currentMessage?: string }[];
}

const COLOR_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
    RED:     { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', label: 'Emergency Stop' },
    YELLOW:  { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', label: 'Quality Hold' },
    BLUE:    { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', label: 'Assistance Needed' },
    GREEN:   { bg: '#d1fae5', border: '#10b981', text: '#065f46', label: 'All Clear' },
    WHITE:   { bg: 'var(--surface-muted)', border: '#d1d5db', text: 'var(--foreground)', label: 'Shift Complete' },
    OFF:     { bg: '#f3f4f6', border: '#9ca3af', text: 'var(--muted-foreground)', label: 'Offline' },
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
    CRITICAL: <XCircle size={16} color="#ef4444" />,
    HIGH:     <AlertTriangle size={16} color="#f59e0b" />,
    MEDIUM:   <Bell size={16} color="#3b82f6" />,
    LOW:      <BellOff size={16} color="#9ca3af" />,
};

export default function AndonPage() {
    const [boards, setBoards] = useState<AndonBoard[]>([]);
    const [alerts, setAlerts] = useState<AndonEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [selectedBoard, setSelectedBoard] = useState<string>('');
    const [trigColor, setTrigColor] = useState<'RED' | 'YELLOW' | 'BLUE'>('RED');
    const [trigMessage, setTrigMessage] = useState('');
    const [trigReason, setTrigReason] = useState('');
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const toast = (text: string, ok = true) => {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 4000);
    };

    const load = useCallback(async () => {
        try {
            const [boardsRes, alertsRes] = await Promise.allSettled([
                fetch('/api/andon'),
                fetch('/api/andon?active=true'),
            ]);
            if (boardsRes.status === 'fulfilled' && boardsRes.value.ok) {
                const d = await boardsRes.value.json();
                const b: AndonBoard[] = d.boards ?? [];
                setBoards(b);
                if (b.length > 0 && !selectedBoard) setSelectedBoard(b[0].id);
            }
            if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
                const d = await alertsRes.value.json();
                setAlerts(d.alerts ?? []);
            }
            setLastRefresh(new Date());
        } catch { /* ignore */ }
        setLoading(false);
    }, [selectedBoard]);

    useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

    // SSE for live events
    useEffect(() => {
        const es = new EventSource('/api/stream');
        es.onmessage = (evt) => {
            try {
                const ev = JSON.parse(evt.data);
                if (ev.type?.startsWith('andon.')) load();
            } catch { /* ignore */ }
        };
        return () => es.close();
    }, [load]);

    const triggerAndon = async () => {
        if (!trigMessage) return;
        setTriggering(true);
        try {
            const res = await fetch('/api/andon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'trigger',
                    boardId: selectedBoard,
                    color: trigColor,
                    message: trigMessage,
                    reason: trigReason || 'Manual trigger',
                    severity: trigColor === 'RED' ? 'CRITICAL' : trigColor === 'YELLOW' ? 'HIGH' : 'MEDIUM',
                }),
            });
            if (res.ok) {
                toast(`Andon ${trigColor} triggered — ${trigMessage}`);
                setTrigMessage(''); setTrigReason('');
                load();
            } else {
                const d = await res.json();
                toast(d.error ?? 'Trigger failed', false);
            }
        } catch { toast('Network error', false); }
        setTriggering(false);
    };

    const acknowledge = async (eventId: string) => {
        await fetch('/api/andon', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'acknowledge', eventId, userId: 'SUPERVISOR' }),
        });
        toast('Alert acknowledged');
        load();
    };

    const resolve = async (eventId: string) => {
        await fetch('/api/andon', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'resolve', eventId }),
        });
        toast('Alert resolved — Andon cleared');
        load();
    };

    const activeAlerts = alerts.filter(a => !a.resolvedAt);
    const resolvedRecent = alerts.filter(a => a.resolvedAt).slice(0, 10);

    return (
        <div style={{ padding: '1.5rem', maxWidth: '100%', fontFamily: 'inherit' }}>
            {/* Toast */}
            {toastMsg && (
                <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000, padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600, color: '#fff', background: toastMsg.ok ? '#10b981' : '#ef4444', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                    {toastMsg.text}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Zap size={24} color="#f59e0b" /> Live Factory Alerts
                    </h1>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>Real-time production floor alerts · {activeAlerts.length} active</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                    {lastRefresh && <span>Updated {lastRefresh.toLocaleTimeString()}</span>}
                    <button onClick={load} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', cursor: 'pointer', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Loading Andon boards...</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
                    {/* LEFT: Board display + alerts */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Board zone display */}
                        {boards.map(board => (
                            <div key={board.id} style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{board.name}</div>
                                    <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, background: board.isActive ? '#d1fae5' : '#f3f4f6', color: board.isActive ? '#065f46' : 'var(--muted-foreground)' }}>
                                        {board.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <div style={{ padding: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {board.displays.length === 0 ? (
                                        <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.5rem' }}>No display zones configured</div>
                                    ) : board.displays.map(d => {
                                        const cfg = COLOR_CONFIG[d.currentColor] ?? COLOR_CONFIG.OFF;
                                        return (
                                            <div key={d.id} style={{ flex: '1 1 120px', minWidth: 120, padding: '1rem', borderRadius: '0.75rem', background: cfg.bg, border: `2px solid ${cfg.border}`, textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, color: cfg.text, letterSpacing: '0.05em', marginBottom: '0.35rem' }}>{d.zone}</div>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: cfg.border, margin: '0 auto 0.35rem', boxShadow: `0 0 12px ${cfg.border}` }} />
                                                <div style={{ fontSize: '0.72rem', color: cfg.text, fontWeight: 600 }}>{cfg.label}</div>
                                                {d.currentMessage && <div style={{ fontSize: '0.65rem', color: cfg.text, opacity: 0.8, marginTop: '0.25rem' }}>{d.currentMessage}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {boards.length === 0 && (
                            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                <Zap size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No Andon boards configured</p>
                                <p style={{ fontSize: '0.85rem' }}>Seed demo data from <a href="/settings" style={{ color: '#3b82f6' }}>Settings</a> to create boards.</p>
                            </div>
                        )}

                        {/* Active alerts */}
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={18} color="#ef4444" /> Active Alerts ({activeAlerts.length})
                            </div>
                            {activeAlerts.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                                    <CheckCircle size={32} style={{ marginBottom: '0.5rem' }} />
                                    <p>All clear — no active alerts</p>
                                </div>
                            ) : activeAlerts.map(a => {
                                const cfg = COLOR_CONFIG[a.color] ?? COLOR_CONFIG.OFF;
                                return (
                                    <div key={a.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: cfg.border, flexShrink: 0, boxShadow: `0 0 8px ${cfg.border}` }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {SEVERITY_ICON[a.severity ?? 'MEDIUM']} {a.message}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
                                                {a.machine ? `${a.machine.code} · ` : ''}{a.reason} · {new Date(a.triggeredAt).toLocaleTimeString()}
                                                {a.acknowledgedAt ? ` · ACK ${new Date(a.acknowledgedAt).toLocaleTimeString()}` : ''}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {!a.acknowledgedAt && (
                                                <button onClick={() => acknowledge(a.id)} style={{ padding: '0.35rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #f59e0b', background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                                                    ACK
                                                </button>
                                            )}
                                            <button onClick={() => resolve(a.id)} style={{ padding: '0.35rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #10b981', background: '#d1fae5', color: '#065f46', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                                                Resolve
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Resolved history */}
                        {resolvedRecent.length > 0 && (
                            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--foreground)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <CheckCircle size={16} color="#10b981" /> Resolved History ({resolvedRecent.length})
                                </div>
                                {resolvedRecent.map((a, i) => (
                                    <div key={a.id} style={{
                                        padding: '0.75rem 1.25rem', borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)',
                                    }}>
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: a.color === 'RED' ? '#dc2626' : a.color === 'YELLOW' ? '#f59e0b' : '#3b82f6' }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{a.reason ?? a.severity ?? '—'} · {a.machine?.name ?? a.machineId ?? 'Floor'}</div>
                                        </div>
                                        <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
                                            <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>✓ Resolved</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>{new Date(a.resolvedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Trigger panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>Trigger Alert</div>
                            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Color selection */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>Alert Type</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {(['RED', 'YELLOW', 'BLUE'] as const).map(c => {
                                            const cfg = COLOR_CONFIG[c];
                                            return (
                                                <button key={c} onClick={() => setTrigColor(c)} style={{
                                                    padding: '0.75rem 1rem', borderRadius: '0.6rem', border: `2px solid ${trigColor === c ? cfg.border : 'var(--card-border)'}`,
                                                    background: trigColor === c ? cfg.bg : 'var(--surface-muted)', color: trigColor === c ? cfg.text : 'var(--foreground)',
                                                    cursor: 'pointer', fontWeight: 600, textAlign: 'left', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                }}>
                                                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: cfg.border, boxShadow: `0 0 6px ${cfg.border}` }} />
                                                    <span>{c}</span>
                                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>{cfg.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Board selector */}
                                {boards.length > 0 && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>Target Board</label>
                                        <select value={selectedBoard} onChange={e => setSelectedBoard(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.88rem' }}>
                                            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                )}

                                {/* Message */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>Message *</label>
                                    <input value={trigMessage} onChange={e => setTrigMessage(e.target.value)} placeholder={trigColor === 'RED' ? 'e.g. Machine stopped — spindle fault' : trigColor === 'YELLOW' ? 'e.g. Quality hold — await inspection' : 'e.g. Material delivery needed at Station 3'} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.88rem', boxSizing: 'border-box' }} />
                                </div>

                                {/* Reason */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>Reason (optional)</label>
                                    <select value={trigReason} onChange={e => setTrigReason(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.88rem' }}>
                                        <option value="">— Select reason —</option>
                                        <option>Mechanical failure</option>
                                        <option>Quality non-conformance</option>
                                        <option>Material shortage</option>
                                        <option>Safety concern</option>
                                        <option>Operator assistance</option>
                                        <option>Tool change</option>
                                        <option>Setup/Changeover</option>
                                        <option>Planned maintenance</option>
                                    </select>
                                </div>

                                <button
                                    onClick={triggerAndon}
                                    disabled={triggering || !trigMessage}
                                    style={{
                                        padding: '0.85rem', borderRadius: '0.6rem', border: 'none', cursor: triggering || !trigMessage ? 'not-allowed' : 'pointer',
                                        background: trigColor === 'RED' ? '#ef4444' : trigColor === 'YELLOW' ? '#f59e0b' : '#3b82f6',
                                        color: '#fff', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        opacity: triggering || !trigMessage ? 0.5 : 1,
                                    }}>
                                    {triggering ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={18} />}
                                    {triggering ? 'Triggering...' : `Trigger ${trigColor} Alert`}
                                </button>
                            </div>
                        </div>

                        {/* Summary KPIs */}
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--foreground)' }}>Alert Summary</div>
                            {[
                                { label: 'Active', value: activeAlerts.length, color: activeAlerts.length > 0 ? '#ef4444' : '#10b981' },
                                { label: 'Unacknowledged', value: activeAlerts.filter(a => !a.acknowledgedAt).length, color: '#f59e0b' },
                                { label: 'Critical (RED)', value: alerts.filter(a => a.color === 'RED' && !a.resolvedAt).length, color: '#ef4444' },
                                { label: 'Resolved today', value: resolvedRecent.length, color: '#10b981' },
                            ].map(kpi => (
                                <div key={kpi.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>{kpi.label}</span>
                                    <strong style={{ fontSize: '1.1rem', color: kpi.color }}>{kpi.value}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
