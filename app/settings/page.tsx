'use client';

import { useEffect, useState } from 'react';
import { Save, User, Settings as SettingsIcon, Cpu, RefreshCw, ShieldCheck, X, Check, Play, Database, Zap } from 'lucide-react';
import styles from './settings.module.css';

type TabKey = 'general' | 'users' | 'simulation';
const STORAGE_KEY = 'partraceflow-settings';

const ROLES = ['Administrator', 'Planner', 'Operator', 'Supervisor', 'Quality Inspector', 'Maintenance'];

const DEFAULT_USERS = [
    { id: '1', username: 'admin',     role: 'Administrator',     email: 'admin@factory.local',    status: 'Active',   lastLogin: '2 mins ago' },
    { id: '2', username: 'planner',   role: 'Planner',           email: 'planner@factory.local',  status: 'Active',   lastLogin: '1 hour ago' },
    { id: '3', username: 'operator',  role: 'Operator',          email: 'operator@factory.local', status: 'Active',   lastLogin: '15 mins ago' },
    { id: '4', username: 'inspector', role: 'Quality Inspector', email: 'qc@factory.local',       status: 'Inactive', lastLogin: 'Yesterday' },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab]       = useState<TabKey>('general');
    const [factoryName, setFactoryName]   = useState('Factory-01');
    const [timezone, setTimezone]         = useState('UTC');
    const [savedAt, setSavedAt]           = useState('');
    const [role, setRole]                 = useState('ADMIN');
    const [roleSaving, setRoleSaving]     = useState(false);

    // Users
    const [users, setUsers]               = useState(DEFAULT_USERS);
    const [editUser, setEditUser]         = useState<typeof DEFAULT_USERS[0] | null>(null);
    const [editDraft, setEditDraft]       = useState<typeof DEFAULT_USERS[0] | null>(null);
    const [userSaved, setUserSaved]       = useState(false);

    // Simulator
    const [simStatus, setSimStatus]       = useState<'RUNNING' | 'STOPPED' | 'RESTARTING'>('RUNNING');
    const [simLog, setSimLog]             = useState<string[]>([
        '[00:00] Simulator started',
        '[00:01] Connected to 4 virtual PLCs',
        '[00:02] Streaming telemetry on 5 signals/machine',
    ]);

    // Demo Mode
    const [demoStatus, setDemoStatus]     = useState<{ isSeeded: boolean; machineCount: number; orderCount: number; telemetryCount: number } | null>(null);
    const [demoAction, setDemoAction]     = useState<'idle' | 'seeding' | 'ticking'>('idle');
    const [demoLog, setDemoLog]           = useState<string[]>([]);
    const [autoTick, setAutoTick]         = useState(false);
    const [autoInterval, setAutoInterval] = useState(5000);

    useEffect(() => {
        fetch('/api/demo').then(r => r.json()).then(setDemoStatus).catch(() => {});
    }, []);

    useEffect(() => {
        fetch('/api/session').then(r => r.json()).then(d => {
            if (d?.role) setRole(d.role);
        }).catch(() => {});
    }, []);

    const handleSeedDemo = async () => {
        setDemoAction('seeding');
        setDemoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Seeding demo data...`]);
        try {
            const res = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed' }) });
            const data = await res.json();
            if (data.success) {
                setDemoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✅ ${data.message}`]);
                const status = await fetch('/api/demo').then(r => r.json());
                setDemoStatus(status);
            } else {
                setDemoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ ${data.error ?? 'Seed failed'}`]);
            }
        } catch (e) {
            setDemoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Network error`]);
        } finally {
            setDemoAction('idle');
        }
    };

    const handleDemoTick = async () => {
        setDemoAction('ticking');
        try {
            const res = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'tick' }) });
            const data = await res.json();
            const ts = new Date().toLocaleTimeString();
            if (data.success) {
                const changes = data.updates?.length ? data.updates.join(', ') : 'All nominal';
                setDemoLog(prev => [...prev, `[${ts}] Tick: ${changes}`]);
                const status = await fetch('/api/demo').then(r => r.json());
                setDemoStatus(status);
            } else {
                setDemoLog(prev => [...prev, `[${ts}] ❌ ${data.message ?? data.error}`]);
            }
        } catch {
            setDemoLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Network error`]);
        } finally {
            setDemoAction('idle');
        }
    };

    useEffect(() => {
        if (!autoTick) return;
        const timer = setInterval(() => {
            handleDemoTick();
        }, autoInterval);
        return () => clearInterval(timer);
    }, [autoTick, autoInterval]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const p = JSON.parse(stored) as any;
                if (p.factoryName) setFactoryName(p.factoryName);
                if (p.timezone)    setTimezone(p.timezone);
                if (p.savedAt)     setSavedAt(p.savedAt);
                if (p.users)       setUsers(p.users);
            }
        } catch { /* ignore */ }
    }, []);

    const handleSave = () => {
        const ts = new Date().toLocaleTimeString();
        setSavedAt(ts);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ factoryName, timezone, savedAt: ts, users })); } catch { /* ignore */ }
    };

    const applyRole = async () => {
        setRoleSaving(true);
        try {
            await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role })
            });
            setSavedAt(new Date().toLocaleTimeString());
        } catch { /* ignore */ }
        setRoleSaving(false);
    };

    const openEdit = (u: typeof DEFAULT_USERS[0]) => {
        setEditUser(u);
        setEditDraft({ ...u });
        setUserSaved(false);
    };

    const saveUser = () => {
        if (!editDraft) return;
        setUsers(prev => prev.map(u => u.id === editDraft.id ? editDraft : u));
        setUserSaved(true);
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            const p = stored ? JSON.parse(stored) : {};
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...p, users: users.map(u => u.id === editDraft.id ? editDraft : u) }));
        } catch { /* ignore */ }
        setTimeout(() => { setEditUser(null); setEditDraft(null); }, 800);
    };

    const handleRestartSimulator = () => {
        setSimStatus('RESTARTING');
        const ts = new Date().toLocaleTimeString();
        setSimLog(prev => [...prev, `[${ts}] Restart requested...`]);
        setTimeout(() => {
            setSimStatus('RUNNING');
            const ts2 = new Date().toLocaleTimeString();
            setSimLog(prev => [...prev,
                `[${ts2}] Simulator stopped`,
                `[${ts2}] Clearing telemetry buffers...`,
                `[${ts2}] Simulator restarted successfully`,
                `[${ts2}] Streaming resumed on all channels`,
            ]);
        }, 2500);
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}><SettingsIcon /> System Configuration</h1>
                    <div className={styles.subtitle}>Control site identity, users, and simulation health.</div>
                </div>
                <div className="status-badge success"><ShieldCheck size={14} /> Secure Mode</div>
            </div>

            {/* Edit User Modal */}
            {editUser && editDraft && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setEditUser(null); }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Edit User: {editUser.username}</h2>
                            <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={22} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {[
                                { label: 'Username', field: 'username' },
                                { label: 'Email',    field: 'email' },
                            ].map(({ label, field }) => (
                                <div key={field}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.35rem' }}>{label}</label>
                                    <input
                                        value={(editDraft as any)[field]}
                                        onChange={e => setEditDraft(d => d ? { ...d, [field]: e.target.value } : d)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            ))}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.35rem' }}>Role</label>
                                <select
                                    value={editDraft.role}
                                    onChange={e => setEditDraft(d => d ? { ...d, role: e.target.value } : d)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                >
                                    {ROLES.map(r => <option key={r}>{r}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.35rem' }}>Status</label>
                                <select
                                    value={editDraft.status}
                                    onChange={e => setEditDraft(d => d ? { ...d, status: e.target.value } : d)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                >
                                    <option>Active</option>
                                    <option>Inactive</option>
                                    <option>Suspended</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setEditUser(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)' }}>
                                    Cancel
                                </button>
                                <button onClick={saveUser} style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: userSaved ? '#10b981' : '#3b82f6', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {userSaved ? <><Check size={16} /> Saved!</> : <><Save size={16} /> Save Changes</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.layout}>
                <div className={styles.sidebar}>
                    <Tab active={activeTab === 'general'}    onClick={() => setActiveTab('general')}    icon={<SettingsIcon size={18} />} label="General Settings" />
                    <Tab active={activeTab === 'users'}      onClick={() => setActiveTab('users')}      icon={<User size={18} />}         label="User Management" />
                    <Tab active={activeTab === 'simulation'} onClick={() => setActiveTab('simulation')} icon={<Cpu size={18} />}          label="PLC Simulation" />
                </div>

                <div className={styles.contentCard}>

                    {activeTab === 'general' && (
                        <div>
                            <h2 className={styles.sectionTitle}>Factory Identity</h2>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Factory Name</label>
                                    <input value={factoryName} onChange={e => setFactoryName(e.target.value)} />
                                    <div className={styles.helper}>Displayed across dashboards and reports.</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Timezone</label>
                                    <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                                        <option value="UTC">UTC (Coordinated Universal Time)</option>
                                        <option value="EST">EST (Eastern Standard Time)</option>
                                        <option value="CST">CST (Central Standard Time)</option>
                                        <option value="PST">PST (Pacific Standard Time)</option>
                                        <option value="IST">IST (India Standard Time)</option>
                                        <option value="CET">CET (Central European Time)</option>
                                    </select>
                                    <div className={styles.helper}>Aligns timestamps with shift reporting.</div>
                                </div>
                            </div>
                            <div style={{ marginTop: '1.5rem', background: 'var(--background)', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem' }}>
                                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Demo Access Role (RBAC)</div>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: '0.5rem 0.75rem' }}>
                                        <option value="ADMIN">ADMIN</option>
                                        <option value="PLANNER">PLANNER</option>
                                        <option value="OPERATOR">OPERATOR</option>
                                        <option value="SUPERVISOR">SUPERVISOR</option>
                                        <option value="QUALITY">QUALITY</option>
                                    </select>
                                    <button className="btn-primary-large" onClick={applyRole} disabled={roleSaving}>
                                        {roleSaving ? 'Applying...' : 'Apply Role'}
                                    </button>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                                        Changes access to Planner/Operator/Quality/Settings.
                                    </span>
                                </div>
                            </div>
                            <div className={styles.actions}>
                                <button className="btn-primary-large" onClick={handleSave}>
                                    <Save size={18} /> Save Changes
                                </button>
                                {savedAt && <span className={styles.saved}>Saved at {savedAt}</span>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'users' && (
                        <div>
                            <h2 className={styles.sectionTitle}>User Access Matrix</h2>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Role</th>
                                        <th>Email</th>
                                        <th>Status</th>
                                        <th>Last Login</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td style={{ fontWeight: 600 }}>{u.username}</td>
                                            <td><span className={styles.pill}>{u.role}</span></td>
                                            <td style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>{u.email}</td>
                                            <td>
                                                <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, background: u.status === 'Active' ? '#d1fae5' : '#fee2e2', color: u.status === 'Active' ? '#065f46' : '#991b1b' }}>
                                                    {u.status}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{u.lastLogin}</td>
                                            <td>
                                                <button className="btn-primary-large" style={{ minHeight: '36px', fontSize: '0.85rem' }} onClick={() => openEdit(u)}>
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'simulation' && (
                        <div>
                            {/* ── Demo Mode ─────────────────────────────────── */}
                            <h2 className={styles.sectionTitle}><Database size={18} /> Demo Mode</h2>
                            <p className={styles.subtitle}>Seed a complete factory dataset and run live simulation ticks — no real PLC required.</p>

                            {demoStatus && (
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'Machines',   value: demoStatus.machineCount,   color: '#3b82f6' },
                                        { label: 'Orders',     value: demoStatus.orderCount,     color: '#8b5cf6' },
                                        { label: 'Telemetry',  value: demoStatus.telemetryCount, color: '#10b981' },
                                    ].map(s => (
                                        <div key={s.label} style={{ flex: '1 1 100px', background: 'var(--background)', border: '1px solid #e5e7eb', borderRadius: '0.75rem', padding: '1rem', textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>{s.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                    className="btn-primary-large"
                                    onClick={handleSeedDemo}
                                    disabled={demoAction !== 'idle'}
                                    style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
                                >
                                    <Database size={18} style={{ animation: demoAction === 'seeding' ? 'spin 1s linear infinite' : undefined }} />
                                    {demoAction === 'seeding' ? 'Seeding...' : 'Seed Factory Data'}
                                </button>
                                <button
                                    className="btn-primary-large"
                                    onClick={handleDemoTick}
                                    disabled={demoAction !== 'idle' || !demoStatus?.isSeeded}
                                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                    title={!demoStatus?.isSeeded ? 'Seed data first' : 'Run one simulation step'}
                                >
                                    <Zap size={18} style={{ animation: demoAction === 'ticking' ? 'spin 1s linear infinite' : undefined }} />
                                    {demoAction === 'ticking' ? 'Ticking...' : 'Run One Tick'}
                                </button>
                                <button
                                    className="btn-primary-large"
                                    onClick={() => setAutoTick(v => !v)}
                                    disabled={!demoStatus?.isSeeded}
                                    style={{ background: autoTick ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'linear-gradient(135deg, #0ea5e9, #22c55e)' }}
                                    title={!demoStatus?.isSeeded ? 'Seed data first' : 'Toggle auto ticks'}
                                >
                                    <Play size={18} /> {autoTick ? 'Stop Auto Tick' : 'Start Auto Tick'}
                                </button>
                                <button
                                    className="btn-primary-large"
                                    onClick={() => {
                                        if (!demoStatus?.isSeeded) return;
                                        let count = 0;
                                        const run = () => {
                                            handleDemoTick();
                                            count++;
                                            if (count < 5) setTimeout(run, 1500);
                                        };
                                        run();
                                    }}
                                    disabled={demoAction !== 'idle' || !demoStatus?.isSeeded}
                                    style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}
                                >
                                    <Play size={18} /> Run 5 Ticks
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#475569' }}>Interval</span>
                                    <select value={autoInterval} onChange={e => setAutoInterval(parseInt(e.target.value))}>
                                        <option value={3000}>3s</option>
                                        <option value={5000}>5s</option>
                                        <option value={8000}>8s</option>
                                        <option value={12000}>12s</option>
                                    </select>
                                </div>
                            </div>

                            {demoLog.length > 0 && (
                                <div style={{ background: '#0f172a', borderRadius: '0.75rem', padding: '1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#4ade80', maxHeight: '160px', overflowY: 'auto', marginBottom: '2rem' }}>
                                    {demoLog.map((line, i) => <div key={i}>{line}</div>)}
                                </div>
                            )}

                            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '1.5rem 0' }} />

                            {/* ── PLC Simulator ──────────────────────────────── */}
                            <h2 className={styles.sectionTitle}>PLC Simulation Control</h2>
                            <p className={styles.subtitle}>Monitor the node service that streams synthetic machine events.</p>

                            <div className={styles.statusCard}>
                                <div className={styles.statusValue} style={{ color: simStatus === 'RUNNING' ? '#10b981' : simStatus === 'RESTARTING' ? '#f59e0b' : '#ef4444' }}>
                                    {simStatus}
                                </div>
                                <div>Simulator Status</div>
                            </div>

                            {/* Live log */}
                            <div style={{ background: '#0f172a', borderRadius: '0.75rem', padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#4ade80', maxHeight: '200px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                                {simLog.map((line, i) => <div key={i}>{line}</div>)}
                            </div>

                            <div className={styles.actions}>
                                <button
                                    className="btn-primary-large"
                                    style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', color: '#fff' }}
                                    onClick={handleRestartSimulator}
                                    disabled={simStatus === 'RESTARTING'}
                                >
                                    <RefreshCw size={18} style={{ animation: simStatus === 'RESTARTING' ? 'spin 1s linear infinite' : undefined }} />
                                    {simStatus === 'RESTARTING' ? 'Restarting...' : 'Restart Simulator'}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <div onClick={onClick} className={`${styles.tab} ${active ? styles.tabActive : ''}`}>
            {icon} {label}
        </div>
    );
}
