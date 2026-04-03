'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Search, ChevronLeft, ChevronRight, RefreshCw, Clock, User, AlertCircle, CheckCircle, Zap, GitBranch } from 'lucide-react';

interface AuditEvent {
    id: string;
    eventType: string;
    details: string;
    userId?: string;
    timestamp: string;
}

interface EventTypeCount {
    type: string;
    count: number;
}

const EVENT_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    WORKFLOW_START: { color: '#3b82f6', bg: '#dbeafe', icon: <GitBranch size={13} /> },
    WORKFLOW_COMPLETE: { color: '#10b981', bg: '#d1fae5', icon: <CheckCircle size={13} /> },
    TASK_ASSIGNED: { color: '#8b5cf6', bg: '#ede9fe', icon: <User size={13} /> },
    TASK_COMPLETED: { color: '#10b981', bg: '#d1fae5', icon: <CheckCircle size={13} /> },
    QUALITY_CHECK: { color: '#f59e0b', bg: '#fef3c7', icon: <Shield size={13} /> },
    SYSTEM_ERROR: { color: '#ef4444', bg: '#fee2e2', icon: <AlertCircle size={13} /> },
};

function EventBadge({ type }: { type: string }) {
    const cfg = EVENT_CONFIG[type] ?? { color: 'var(--muted-foreground)', bg: '#f3f4f6', icon: <Zap size={13} /> };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '2px 9px', borderRadius: '999px', background: cfg.bg, color: cfg.color, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {cfg.icon} {type.replace(/_/g, ' ')}
        </span>
    );
}

export default function AuditPage() {
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [types, setTypes] = useState<EventTypeCount[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [filterType, setFilterType] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: '50' });
        if (filterType) params.set('type', filterType);
        if (search) params.set('search', search);
        const r = await fetch(`/api/audit?${params}`);
        const d = await r.json();
        setEvents(d.events ?? []);
        setTotal(d.total ?? 0);
        setPages(d.pages ?? 1);
        setTypes(d.types ?? []);
        setLoading(false);
    }, [page, filterType, search]);

    useEffect(() => { load(); }, [load]);

    const doSearch = () => { setSearch(searchInput); setPage(1); };

    return (
        <div style={{ padding: '1.5rem', fontFamily: 'inherit', background: 'var(--background)', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Shield size={24} color="#6366f1" /> Audit Trail
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        Full immutable log of all system events — workflows, tasks, quality checks, errors
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                        <RefreshCw size={15} /> Refresh
                    </button>
                    <button
                        onClick={() => {
                            const headers = ['Timestamp', 'Event Type', 'Details', 'User'];
                            const rows = events.map(e => [
                                new Date(e.timestamp).toLocaleString(),
                                e.eventType,
                                (e.details ?? '').replace(/,/g, ';'),
                                e.userId ?? '—',
                            ]);
                            const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.1rem', borderRadius: '0.5rem', border: 'none', background: '#1e86ff', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                    >
                        ↓ Download CSV
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'var(--card-bg)', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1rem 1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>Total Events</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6366f1' }}>{total.toLocaleString()}</div>
                </div>
                {types.slice(0, 4).map(t => {
                    const cfg = EVENT_CONFIG[t.type] ?? { color: 'var(--muted-foreground)', bg: '#f3f4f6' };
                    return (
                        <div key={t.type} onClick={() => { setFilterType(t.type === filterType ? '' : t.type); setPage(1); }} style={{ borderRadius: '0.75rem', border: `1px solid ${filterType === t.type ? cfg.color + '60' : 'var(--card-border)'}`, padding: '1rem 1.25rem', cursor: 'pointer', background: filterType === t.type ? cfg.bg : 'var(--card-bg)' }}>
                            <div style={{ fontSize: '0.72rem', color: cfg.color, fontWeight: 700, textTransform: 'uppercase' }}>{t.type.replace(/_/g, ' ')}</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: cfg.color }}>{t.count}</div>
                        </div>
                    );
                })}
            </div>

            {/* Filters */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="Search event details…" style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2rem', borderRadius: '0.4rem', border: '1.5px solid #e5e7eb', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ padding: '0.55rem 0.75rem', borderRadius: '0.4rem', border: '1.5px solid var(--card-border)', fontSize: '0.9rem', color: 'var(--foreground)', background: 'var(--card-bg)' }}>
                    <option value="" style={{ color: 'var(--foreground)' }}>All event types</option>
                    {types.map(t => <option key={t.type} value={t.type} style={{ color: 'var(--foreground)' }}>{t.type} ({t.count})</option>)}
                </select>
                <button onClick={doSearch} style={{ padding: '0.55rem 1.1rem', borderRadius: '0.4rem', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Search</button>
                {(search || filterType) && (
                    <button onClick={() => { setSearch(''); setSearchInput(''); setFilterType(''); setPage(1); }} style={{ padding: '0.55rem 1rem', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: 'var(--surface-muted)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        Clear
                    </button>
                )}
            </div>

            {/* Table */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                    <span><strong style={{ color: 'var(--foreground)' }}>{total.toLocaleString()}</strong> events{(search || filterType) ? ' (filtered)' : ''}</span>
                    <span>Page {page} of {pages}</span>
                </div>

                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading events…</div>
                ) : events.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                        <Shield size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
                        <div>No events found</div>
                    </div>
                ) : (
                    <div>
                        {events.map(ev => (
                            <div key={ev.id}>
                                <div onClick={() => setExpanded(expanded === ev.id ? null : ev.id)} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f9fafb', display: 'grid', gridTemplateColumns: '160px 1fr auto auto', gap: '1rem', alignItems: 'center', cursor: 'pointer', background: expanded === ev.id ? '#fafbff' : 'transparent' }}>
                                    <EventBadge type={ev.eventType} />
                                    <div style={{ fontSize: '0.88rem', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {ev.details.split(' | Data:')[0]}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                        {ev.userId && <><User size={11} /> {ev.userId}</>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                        <Clock size={11} /> {new Date(ev.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                {expanded === ev.id && (
                                    <div style={{ padding: '0.75rem 1.25rem 1rem', background: 'var(--background)', borderBottom: '1px solid var(--card-border)' }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase' }}>Full Details</div>
                                        <pre style={{ margin: 0, fontSize: '0.82rem', color: 'var(--foreground)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--card-bg)', border: '1px solid #e5e7eb', borderRadius: '0.4rem', padding: '0.75rem' }}>
                                            {(() => {
                                                const [msg, data] = ev.details.split(' | Data:');
                                                if (!data) return ev.details;
                                                try {
                                                    return `${msg}\n\n${JSON.stringify(JSON.parse(data), null, 2)}`;
                                                } catch {
                                                    return ev.details;
                                                }
                                            })()}
                                        </pre>
                                        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                                            ID: {ev.id} · {new Date(ev.timestamp).toISOString()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {pages > 1 && (
                    <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: page === 1 ? 'var(--surface-muted)' : 'var(--card-bg)', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#9ca3af' : 'var(--foreground)', display: 'flex', alignItems: 'center' }}>
                            <ChevronLeft size={16} />
                        </button>
                        {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                            const p = Math.max(1, Math.min(pages - 4, page - 2)) + i;
                            return (
                                <button key={p} onClick={() => setPage(p)} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: p === page ? '#6366f1' : 'var(--card-bg)', color: p === page ? 'var(--card-bg)' : 'var(--foreground)', cursor: 'pointer', fontWeight: p === page ? 700 : 400 }}>
                                    {p}
                                </button>
                            );
                        })}
                        <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: page === pages ? 'var(--surface-muted)' : 'var(--card-bg)', cursor: page === pages ? 'not-allowed' : 'pointer', color: page === pages ? '#9ca3af' : 'var(--foreground)', display: 'flex', alignItems: 'center' }}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
