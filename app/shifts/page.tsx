'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Users, Play, Square, LogIn, LogOut, Plus, TrendingUp, Calendar, ChevronRight } from 'lucide-react';

interface ShiftSchedule {
    id: string;
    date: string;
    status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
    targetQuantity: number;
    shift: { name: string; type: string; startTime: string; endTime: string; durationHours: number };
    operatorShifts: { id: string; userId: string; role: string; clockIn: string; clockOut?: string; user: { username: string } }[];
    shiftProduction?: { actualQuantity: number; goodQuantity: number; scrapQuantity: number; oee?: number; availability?: number; performance?: number; quality?: number };
}

interface Shift {
    id: string;
    name: string;
    type: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    plant?: { name: string };
}

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
    PLANNED:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    ACTIVE:    { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    COMPLETED: { bg: '#f3f4f6', text: 'var(--foreground)', border: '#d1d5db' },
};

const SHIFT_COLORS: Record<string, string> = {
    DAY: '#f59e0b', EVENING: '#8b5cf6', NIGHT: '#1d4ed8',
};

export default function ShiftsPage() {
    const [schedules, setSchedules] = useState<ShiftSchedule[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ShiftSchedule | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [clockInUser, setClockInUser] = useState('');

    // Create schedule form
    const [newShiftId, setNewShiftId] = useState('');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const [newTarget, setNewTarget] = useState('350');

    const toast = (text: string, ok = true) => {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3500);
    };

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/shifts');
            if (res.ok) {
                const d = await res.json();
                setShifts(d.shifts ?? []);
                setSchedules(d.schedules ?? []);
                if (d.schedules?.length && !selected) setSelected(d.schedules[0]);
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const post = async (body: object) => {
        const res = await fetch('/api/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? 'Failed');
        return d;
    };

    const handleStart = async (id: string) => {
        try { await post({ action: 'start_shift', scheduleId: id }); toast('Shift started'); load(); }
        catch (e: any) { toast(e.message, false); }
    };

    const handleClose = async (id: string) => {
        try { await post({ action: 'close_shift', scheduleId: id }); toast('Shift closed'); load(); }
        catch (e: any) { toast(e.message, false); }
    };

    const handleClockIn = async (scheduleId: string) => {
        if (!clockInUser.trim()) { toast('Enter username', false); return; }
        try { await post({ action: 'clock_in', scheduleId, userId: clockInUser.trim(), role: 'OPERATOR' }); toast(`${clockInUser} clocked in`); setClockInUser(''); load(); }
        catch (e: any) { toast(e.message, false); }
    };

    const handleClockOut = async (scheduleId: string, userId: string) => {
        try { await post({ action: 'clock_out', scheduleId, userId }); toast(`${userId} clocked out`); load(); }
        catch (e: any) { toast(e.message, false); }
    };

    const handleCreateSchedule = async () => {
        if (!newShiftId) { toast('Select a shift template', false); return; }
        try {
            await post({ action: 'create_schedule', shiftId: newShiftId, date: newDate, targetQuantity: parseInt(newTarget) || 350 });
            toast('Schedule created'); setShowCreate(false); load();
        } catch (e: any) { toast(e.message, false); }
    };

    const activeSchedule = schedules.find(s => s.status === 'ACTIVE');
    const todaySchedules = schedules.filter(s => s.date.startsWith(new Date().toISOString().split('T')[0]));

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
                <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.25rem', borderRadius: '0.6rem', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                    <Plus size={16} /> Schedule Shift
                </button>
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
                                <p style={{ fontSize: '0.85rem' }}>Click "Schedule Shift" to create one.</p>
                            </div>
                        ) : schedules.map(s => {
                            const cfg = STATUS_COLOR[s.status];
                            const shiftColor = SHIFT_COLORS[s.shift?.type ?? 'DAY'] ?? 'var(--muted-foreground)';
                            const activeOps = s.operatorShifts.filter(o => !o.clockOut);
                            const prod = s.shiftProduction;
                            return (
                                <div key={s.id} onClick={() => setSelected(s)} style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: `1px solid ${selected?.id === s.id ? '#3b82f6' : 'var(--card-border)'}`, padding: '1.25rem', cursor: 'pointer', boxShadow: selected?.id === s.id ? '0 0 0 2px #bfdbfe' : '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.15s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: shiftColor }} />
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{s.shift?.name ?? 'Shift'}</div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>{new Date(s.date).toLocaleDateString()} · {s.shift?.startTime} – {s.shift?.endTime}</div>
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

            {/* Create schedule modal */}
            {showCreate && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem', width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.2rem', fontWeight: 700 }}>Schedule a Shift</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Shift Template</label>
                                <select value={newShiftId} onChange={e => setNewShiftId(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}>
                                    <option value="">— Select —</option>
                                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>)}
                                </select>
                                {shifts.length === 0 && <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: '0.3rem' }}>No shift templates yet. Seed demo data first.</div>}
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Date</label>
                                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Target Quantity</label>
                                <input type="number" value={newTarget} onChange={e => setNewTarget(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.4rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleCreateSchedule} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Create</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
