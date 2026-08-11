'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Users, Play, Square, LogIn, LogOut, Plus, TrendingUp, Calendar, ChevronRight, Settings } from 'lucide-react';

interface ProductionLineOption {
    id: string;
    code: string;
    name: string;
}

interface ShiftTemplate {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    targetQuantity: number | null;
    isActive: boolean;
}

interface ShiftSchedule {
    id: string;
    date: string;
    status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
    targetQuantity: number;
    shift?: { name: string; type?: string; startTime: string; endTime: string; durationHours: number } | null;
    template?: { name: string; startTime: string; endTime: string } | null;
    operatorShifts: { id: string; userId: string; role: string; clockIn: string; clockOut?: string; user: { username: string } }[];
    shiftProduction?: { actualQuantity: number; goodQuantity: number; scrapQuantity: number; oee?: number; availability?: number; performance?: number; quality?: number };
}

// Resolved display values from whichever source populated the schedule
function resolveShiftInfo(s: ShiftSchedule) {
    const src = s.template ?? s.shift;
    return {
        name: src?.name ?? 'Shift',
        startTime: src?.startTime ?? '',
        endTime: src?.endTime ?? '',
        type: s.shift?.type ?? 'DAY',
    };
}

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
    PLANNED:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    ACTIVE:    { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    COMPLETED: { bg: '#f3f4f6', text: 'var(--foreground)', border: '#d1d5db' },
};

const SHIFT_COLORS: Record<string, string> = {
    DAY: '#f59e0b', EVENING: '#8b5cf6', NIGHT: '#1d4ed8',
};

// ── Validation helpers (mirror server-side rules) ─────────────────────────────

function validateTemplate(name: string, startTime: string, endTime: string, qty: string): string | null {
    if (!name.trim()) return 'Name is required';
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(startTime)) return 'Start time must be HH:MM (e.g. 06:00)';
    if (!timeRe.test(endTime)) return 'End time must be HH:MM (e.g. 14:00)';
    if (startTime === endTime) return 'End time must differ from start time';
    if (qty !== '' && (isNaN(Number(qty)) || Number(qty) <= 0)) return 'Target quantity must be greater than 0';
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
    const [schedules, setSchedules] = useState<ShiftSchedule[]>([]);
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
    const [productionLines, setProductionLines] = useState<ProductionLineOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ShiftSchedule | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [showCreateTemplate, setShowCreateTemplate] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [clockInUser, setClockInUser] = useState('');

    // Create schedule form
    const [newTemplateId, setNewTemplateId] = useState('');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const [newTarget, setNewTarget] = useState('');
    const [newProductionLineId, setNewProductionLineId] = useState('');

    // Create template form
    const [tplName, setTplName] = useState('');
    const [tplStart, setTplStart] = useState('');
    const [tplEnd, setTplEnd] = useState('');
    const [tplQty, setTplQty] = useState('');
    const [tplSaving, setTplSaving] = useState(false);

    const getErrorMessage = (err: unknown): string => err instanceof Error ? err.message : 'Failed';

    const toast = (text: string, ok = true) => {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3500);
    };

    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch('/api/shift-templates');
            if (res.ok) {
                const d = await res.json();
                setTemplates(d.templates ?? []);
            }
        } catch { /* ignore */ }
    }, []);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/shifts');
            if (res.ok) {
                const d = await res.json();
                setSchedules(d.schedules ?? []);
                setSelected(curr => curr ?? d.schedules?.[0] ?? null);
                const lines: ProductionLineOption[] = d.productionLines ?? [];
                setProductionLines(lines);
                // Auto-select when there's exactly one line (matches the API's
                // own single-line fallback); with more than one, the user must
                // pick — the picker below only renders in that case.
                if (lines.length === 1) setNewProductionLineId(curr => curr || lines[0].id);
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
        loadTemplates();
    }, [load, loadTemplates]);

    const post = async (body: object) => {
        const res = await fetch('/api/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? 'Failed');
        return d;
    };

    const handleStart = async (id: string) => {
        try { await post({ action: 'start_shift', scheduleId: id }); toast('Shift started'); load(); }
        catch (err) { toast(getErrorMessage(err), false); }
    };

    const handleClose = async (id: string) => {
        try { await post({ action: 'close_shift', scheduleId: id }); toast('Shift closed'); load(); }
        catch (err) { toast(getErrorMessage(err), false); }
    };

    const handleClockIn = async (scheduleId: string) => {
        if (!clockInUser.trim()) { toast('Enter username', false); return; }
        try { await post({ action: 'clock_in', scheduleId, userId: clockInUser.trim(), role: 'OPERATOR' }); toast(`${clockInUser} clocked in`); setClockInUser(''); load(); }
        catch (err) { toast(getErrorMessage(err), false); }
    };

    const handleClockOut = async (scheduleId: string, userId: string) => {
        try { await post({ action: 'clock_out', scheduleId, userId }); toast(`${userId} clocked out`); load(); }
        catch (err) { toast(getErrorMessage(err), false); }
    };

    const handleCreateSchedule = async () => {
        if (!newTemplateId) { toast('Select a shift template', false); return; }
        if (productionLines.length > 1 && !newProductionLineId) { toast('Select a production line', false); return; }
        const targetNum = newTarget.trim() ? parseInt(newTarget) : undefined;
        if (newTarget.trim() && (!targetNum || targetNum <= 0)) { toast('Target quantity must be greater than 0', false); return; }
        try {
            await post({ action: 'create_schedule', templateId: newTemplateId, date: newDate, targetQuantity: targetNum, productionLineId: newProductionLineId || undefined });
            toast('Shift scheduled'); setShowCreate(false); setNewTemplateId(''); setNewTarget(''); load();
        } catch (err) { toast(getErrorMessage(err), false); }
    };

    const handleCreateTemplate = async () => {
        const err = validateTemplate(tplName, tplStart, tplEnd, tplQty);
        if (err) { toast(err, false); return; }

        setTplSaving(true);
        try {
            const res = await fetch('/api/shift-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: tplName.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
                    startTime: tplStart,
                    endTime: tplEnd,
                    targetQuantity: tplQty ? parseInt(tplQty) : undefined,
                }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error ?? 'Failed');
            toast(`Template "${tplName.trim()}" created`);
            setTplName(''); setTplStart(''); setTplEnd(''); setTplQty('');
            setShowCreateTemplate(false);
            await loadTemplates();
            // Pre-select the new template
            setNewTemplateId(d.template.id);
        } catch (err) { toast(getErrorMessage(err), false); }
        finally { setTplSaving(false); }
    };

    const todaySchedules = schedules.filter(s => s.date.startsWith(new Date().toISOString().split('T')[0]));
    const activeTemplates = templates.filter(t => t.isActive);

    return (
        <div style={{ padding: '1.5rem', fontFamily: 'inherit', background: 'var(--background)', minHeight: '100vh' }}>
            {/* Toast */}
            {toastMsg && <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000, padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600, color: '#fff', background: toastMsg.ok ? '#10b981' : '#ef4444', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>{toastMsg.text}</div>}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Clock size={24} color="#3b82f6" /> Shift Management
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        Manage shifts, operator clock-in/out, and production targets
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => setShowCreateTemplate(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.25rem', borderRadius: '0.6rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', color: 'var(--foreground)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                        <Settings size={16} /> Shift Templates
                    </button>
                    <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.25rem', borderRadius: '0.6rem', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                        <Plus size={16} /> Schedule Shift
                    </button>
                </div>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Today\'s Shifts', value: todaySchedules.length, icon: <Calendar size={20} color="#3b82f6" />, bg: '#eff6ff' },
                    { label: 'Active Now', value: schedules.filter(s => s.status === 'ACTIVE').length, icon: <Play size={20} color="#10b981" />, bg: '#d1fae5' },
                    { label: 'Operators On Floor', value: schedules.filter(s => s.status === 'ACTIVE').reduce((n, s) => n + s.operatorShifts.filter(o => !o.clockOut).length, 0), icon: <Users size={20} color="#8b5cf6" />, bg: '#ede9fe' },
                    { label: 'Completed Today', value: todaySchedules.filter(s => s.status === 'COMPLETED').length, icon: <TrendingUp size={20} color="#f59e0b" />, bg: '#fef3c7' },
                ].map(k => (
                    <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '0.6rem', background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k.icon}</div>
                        <div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }}>{k.value}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>{k.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>Loading shifts...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '1.5rem' }}>
                    {/* LEFT: Schedule list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {schedules.length === 0 ? (
                            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                <Clock size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                                <p style={{ fontWeight: 600 }}>No shifts scheduled</p>
                                <p style={{ fontSize: '0.85rem' }}>Click &quot;Schedule Shift&quot; to create one.</p>
                            </div>
                        ) : schedules.map(s => {
                            const info = resolveShiftInfo(s);
                            const cfg = STATUS_COLOR[s.status];
                            const shiftColor = SHIFT_COLORS[info.type] ?? 'var(--muted-foreground)';
                            const activeOps = s.operatorShifts.filter(o => !o.clockOut);
                            const prod = s.shiftProduction;
                            return (
                                <div key={s.id} onClick={() => setSelected(s)} style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: `1px solid ${selected?.id === s.id ? '#3b82f6' : 'var(--card-border)'}`, padding: '1.25rem', cursor: 'pointer', boxShadow: selected?.id === s.id ? '0 0 0 2px #bfdbfe' : '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.15s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: shiftColor }} />
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{info.name}</div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>{new Date(s.date).toLocaleDateString()} · {info.startTime} – {info.endTime}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>{s.status}</span>
                                            <ChevronRight size={16} color="#9ca3af" />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                        {[
                                            { label: 'Target', value: s.targetQuantity },
                                            { label: 'Actual', value: prod?.actualQuantity ?? 0 },
                                            { label: 'Scrap', value: prod?.scrapQuantity ?? 0 },
                                            { label: 'OEE', value: prod?.oee ? `${Math.round(prod.oee)}%` : '—' },
                                        ].map(m => (
                                            <div key={m.label} style={{ background: 'var(--surface-muted)', borderRadius: '0.4rem', padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{m.value}</div>
                                                <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{m.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {activeOps.length > 0 && (
                                        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                            <Users size={13} /> {activeOps.length} operator{activeOps.length !== 1 ? 's' : ''} on floor: {activeOps.map(o => o.user?.username ?? o.userId).join(', ')}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* RIGHT: Detail panel */}
                    {selected ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1rem', height: 'fit-content' }}>
                            {/* Actions */}
                            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>Shift Actions</div>
                                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {selected.status === 'PLANNED' && (
                                        <button onClick={() => handleStart(selected.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '0.6rem', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                                            <Play size={18} /> Start Shift
                                        </button>
                                    )}
                                    {selected.status === 'ACTIVE' && (
                                        <button onClick={() => handleClose(selected.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '0.6rem', border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                                            <Square size={18} /> Close Shift
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Clock in/out */}
                            {selected.status === 'ACTIVE' && (
                                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Users size={16} /> Operator Clock-In
                                    </div>
                                    <div style={{ padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                            <input value={clockInUser} onChange={e => setClockInUser(e.target.value)} placeholder="Username..." style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.88rem' }} />
                                            <button onClick={() => handleClockIn(selected.id)} style={{ padding: '0.5rem 1rem', borderRadius: '0.4rem', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                                                <LogIn size={15} /> In
                                            </button>
                                        </div>
                                        {selected.operatorShifts.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {selected.operatorShifts.map(op => (
                                                    <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.6rem', background: op.clockOut ? 'var(--surface-muted)' : '#d1fae5', borderRadius: '0.4rem', fontSize: '0.82rem' }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: op.clockOut ? '#9ca3af' : '#10b981' }} />
                                                        <span style={{ flex: 1, fontWeight: 500 }}>{op.user?.username ?? op.userId}</span>
                                                        <span style={{ color: 'var(--muted-foreground)' }}>{new Date(op.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {!op.clockOut ? (
                                                            <button onClick={() => handleClockOut(selected.id, op.userId)} style={{ padding: '2px 8px', borderRadius: '0.3rem', border: '1px solid #ef4444', background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                <LogOut size={12} /> Out
                                                            </button>
                                                        ) : (
                                                            <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>→ {new Date(op.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Production summary */}
                            {selected.shiftProduction && (
                                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <TrendingUp size={16} /> Production Summary
                                    </div>
                                    <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        {[
                                            { label: 'OEE', value: selected.shiftProduction.oee ? `${Math.round(selected.shiftProduction.oee)}%` : '—', color: '#3b82f6' },
                                            { label: 'Availability', value: selected.shiftProduction.availability ? `${Math.round(selected.shiftProduction.availability)}%` : '—', color: '#10b981' },
                                            { label: 'Performance', value: selected.shiftProduction.performance ? `${Math.round(selected.shiftProduction.performance)}%` : '—', color: '#f59e0b' },
                                            { label: 'Quality', value: selected.shiftProduction.quality ? `${Math.round(selected.shiftProduction.quality)}%` : '—', color: '#8b5cf6' },
                                            { label: 'Good Parts', value: selected.shiftProduction.goodQuantity, color: '#10b981' },
                                            { label: 'Scrap', value: selected.shiftProduction.scrapQuantity, color: '#ef4444' },
                                        ].map(m => (
                                            <div key={m.label} style={{ background: 'var(--surface-muted)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: m.color }}>{m.value}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>{m.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid #e5e7eb', padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                            Select a shift to see details
                        </div>
                    )}
                </div>
            )}

            {/* ── Schedule Shift modal ──────────────────────────────────────── */}
            {showCreate && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem', width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.2rem', fontWeight: 700 }}>Schedule a Shift</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Shift Template</label>
                                {activeTemplates.length === 0 ? (
                                    <div style={{ padding: '0.85rem 1rem', borderRadius: '0.5rem', border: '1px dashed #fbbf24', background: '#fffbeb', color: '#92400e', fontSize: '0.85rem' }}>
                                        No shift templates available. Create one first.
                                        <button
                                            onClick={() => { setShowCreate(false); setShowCreateTemplate(true); }}
                                            style={{ marginLeft: '0.75rem', padding: '3px 10px', borderRadius: '0.3rem', border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                                        >
                                            Create Template
                                        </button>
                                    </div>
                                ) : (
                                    <select
                                        value={newTemplateId}
                                        onChange={e => {
                                            setNewTemplateId(e.target.value);
                                            const t = activeTemplates.find(t => t.id === e.target.value);
                                            if (t?.targetQuantity && !newTarget) setNewTarget(String(t.targetQuantity));
                                        }}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                    >
                                        <option value="">— Select —</option>
                                        {activeTemplates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} ({t.startTime}–{t.endTime})</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            {productionLines.length > 1 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Production Line</label>
                                    <select
                                        value={newProductionLineId}
                                        onChange={e => setNewProductionLineId(e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                    >
                                        <option value="">— Select —</option>
                                        {productionLines.map(l => (
                                            <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Date</label>
                                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Target Quantity <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — uses template default if blank)</span></label>
                                <input type="number" min="1" value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder="e.g. 350" style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button onClick={() => { setShowCreate(false); setNewTemplateId(''); setNewTarget(''); }} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleCreateSchedule} disabled={activeTemplates.length === 0} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: activeTemplates.length === 0 ? '#d1d5db' : '#3b82f6', color: '#fff', cursor: activeTemplates.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600 }}>Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create Shift Template modal ───────────────────────────────── */}
            {showCreateTemplate && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem', width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem', fontWeight: 700 }}>Create Shift Template</h2>
                        <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Templates define shift times that can be reused when scheduling.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    value={tplName}
                                    onChange={e => setTplName(e.target.value)}
                                    placeholder="e.g. Morning Shift"
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Start Time <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        type="time"
                                        value={tplStart}
                                        onChange={e => setTplStart(e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>End Time <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        type="time"
                                        value={tplEnd}
                                        onChange={e => setTplEnd(e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>
                            {tplStart && tplEnd && tplStart === tplEnd && (
                                <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>End time must differ from start time</div>
                            )}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Default Target Quantity <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                                <input
                                    type="number"
                                    min="1"
                                    value={tplQty}
                                    onChange={e => setTplQty(e.target.value)}
                                    placeholder="e.g. 350"
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        {/* Existing templates list */}
                        {templates.length > 0 && (
                            <div style={{ marginTop: '1.25rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>Existing Templates</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 140, overflowY: 'auto' }}>
                                    {templates.map(t => (
                                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', borderRadius: '0.35rem', background: 'var(--surface-muted)', fontSize: '0.82rem' }}>
                                            <span style={{ fontWeight: 600 }}>{t.name}</span>
                                            <span style={{ color: 'var(--muted-foreground)' }}>{t.startTime}–{t.endTime}{t.targetQuantity ? ` · ${t.targetQuantity} units` : ''}</span>
                                            {!t.isActive && <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: '0.5rem' }}>inactive</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button onClick={() => { setShowCreateTemplate(false); setTplName(''); setTplStart(''); setTplEnd(''); setTplQty(''); }} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleCreateTemplate} disabled={tplSaving} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: tplSaving ? '#93c5fd' : '#3b82f6', color: '#fff', cursor: tplSaving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                                {tplSaving ? 'Saving…' : 'Create Template'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
