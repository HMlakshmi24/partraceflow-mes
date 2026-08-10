'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, UserPlus, Shield, Key, ToggleLeft, ToggleRight, X, Check, AlertTriangle, RefreshCw, ArrowLeft, ShieldOff } from 'lucide-react';
import Link from 'next/link';

const ROLES = ['ADMIN', 'SUPERVISOR', 'PLANNER', 'OPERATOR', 'QC', 'QUALITY', 'MAINTENANCE'] as const;
type Role = typeof ROLES[number];

interface MESUser {
    id:                 string;
    username:           string;
    role:               string;
    isActive:           boolean;
    email:              string | null;
    displayName:        string | null;
    employeeId:         string | null;
    mustChangePassword: boolean;
    lastLoginAt:        string | null;
    createdAt:          string;
    sessionVersion:     number;
    mfaEnabled:         boolean;
}

const ROLE_COLORS: Record<string, string> = {
    ADMIN:       '#6366f1',
    SUPERVISOR:  '#0ea5e9',
    PLANNER:     '#8b5cf6',
    OPERATOR:    '#10b981',
    QC:          '#f59e0b',
    QUALITY:     '#f59e0b',
    MAINTENANCE: '#6b7280',
};

const pill = (role: string) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    background: (ROLE_COLORS[role] ?? '#6b7280') + '22',
    color: ROLE_COLORS[role] ?? '#6b7280',
    border: `1px solid ${(ROLE_COLORS[role] ?? '#6b7280')}44`,
});

const statusPill = (active: boolean) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: 700,
    background: active ? '#d1fae5' : '#fee2e2',
    color:      active ? '#065f46' : '#991b1b',
});

export default function UsersPage() {
    const [users,       setUsers]       = useState<MESUser[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState('');
    const [search,      setSearch]      = useState('');
    const [roleFilter,  setRoleFilter]  = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [toast,       setToast]       = useState('');
    const [repairing,   setRepairing]   = useState(false);

    // Create modal
    const [showCreate,  setShowCreate]  = useState(false);
    const [creating,    setCreating]    = useState(false);
    const [newUser,     setNewUser]     = useState<{
        username: string; password: string; role: Role;
        email: string; displayName: string; mustChangePassword: boolean;
    }>({ username: '', password: '', role: 'OPERATOR', email: '', displayName: '', mustChangePassword: true });

    // Edit modal
    const [editTarget,  setEditTarget]  = useState<MESUser | null>(null);
    const [editDraft,   setEditDraft]   = useState<{ role: Role; email: string; displayName: string } | null>(null);
    const [saving,      setSaving]      = useState(false);

    // Reset password modal
    const [resetTarget, setResetTarget] = useState<MESUser | null>(null);
    const [resetMode,   setResetMode]   = useState<'force_change' | 'set_password'>('force_change');
    const [newPwd,      setNewPwd]      = useState('');
    const [resetting,   setResetting]   = useState(false);
    const [resettingMfaId, setResettingMfaId] = useState<string | null>(null);

    const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({ pageSize: '200' });
        if (search)      params.set('search', search);
        if (roleFilter)  params.set('role', roleFilter);
        if (!showInactive) params.set('isActive', 'true');
        try {
            const res  = await fetch(`/api/users?${params}`, { credentials: 'include' });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'Failed to load users'); return; }
            setUsers(data.users ?? []);
            setError('');
        } catch {
            setError('Network error — could not load users');
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, showInactive]);

    useEffect(() => { load(); }, [load]);

    // ── Create user ────────────────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!newUser.username || !newUser.password) return;
        setCreating(true);
        try {
            const res = await fetch('/api/users', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    ...newUser,
                    email:       newUser.email       || null,
                    displayName: newUser.displayName || null,
                }),
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) { flash(data.error ?? 'Failed to create user'); return; }
            setShowCreate(false);
            setNewUser({ username: '', password: '', role: 'OPERATOR', email: '', displayName: '', mustChangePassword: true });
            flash(`User '${data.username}' created`);
            load();
        } catch { flash('Network error'); }
        finally { setCreating(false); }
    };

    // ── Edit user ──────────────────────────────────────────────────────────────
    const openEdit = (u: MESUser) => {
        setEditTarget(u);
        setEditDraft({ role: u.role as Role, email: u.email ?? '', displayName: u.displayName ?? '' });
    };

    const handleSaveEdit = async () => {
        if (!editTarget || !editDraft) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/users/${editTarget.id}`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    role:        editDraft.role,
                    email:       editDraft.email       || null,
                    displayName: editDraft.displayName || null,
                }),
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) { flash(data.error ?? 'Failed to update user'); return; }
            setEditTarget(null);
            flash('User updated');
            load();
        } catch { flash('Network error'); }
        finally { setSaving(false); }
    };

    // ── Toggle active ──────────────────────────────────────────────────────────
    const toggleActive = async (u: MESUser) => {
        const res = await fetch(`/api/users/${u.id}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ isActive: !u.isActive }),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) { flash(data.error ?? 'Failed'); return; }
        flash(u.isActive ? `'${u.username}' deactivated` : `'${u.username}' activated`);
        load();
    };

    // ── Reset password ─────────────────────────────────────────────────────────
    const handleReset = async () => {
        if (!resetTarget) return;
        setResetting(true);
        const body: any = { mode: resetMode };
        if (resetMode === 'set_password') body.newPassword = newPwd;
        try {
            const res = await fetch(`/api/users/${resetTarget.id}/reset-password`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) { flash(data.error ?? 'Failed'); return; }
            setResetTarget(null);
            setNewPwd('');
            flash(`Password reset for '${resetTarget.username}'`);
        } catch { flash('Network error'); }
        finally { setResetting(false); }
    };

    // ── Reset MFA (recover a locked-out user) ────────────────────────────────────
    const handleResetMfa = async (u: MESUser) => {
        if (!confirm(`Reset MFA for '${u.username}'? They will be signed out of every active session and required to re-enroll MFA on next login.`)) return;
        setResettingMfaId(u.id);
        try {
            const res = await fetch(`/api/users/${u.id}/reset-mfa`, { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (!res.ok) { flash(data.error ?? 'Failed to reset MFA'); return; }
            flash(`MFA reset for '${u.username}' — they must re-enroll on next login`);
            load();
        } catch { flash('Network error'); }
        finally { setResettingMfaId(null); }
    };

    // ── Repair accounts ────────────────────────────────────────────────────────
    const handleRepair = async () => {
        setRepairing(true);
        try {
            const res = await fetch('/api/users/repair', { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (!res.ok) { flash(data.error ?? 'Repair failed'); return; }
            const created = data.results?.filter((r: any) => r.action === 'created').length ?? 0;
            const repaired = data.results?.filter((r: any) => r.action === 'repaired').length ?? 0;
            flash(`Repair complete: ${created} created, ${repaired} repaired`);
            load();
        } catch { flash('Network error'); }
        finally { setRepairing(false); }
    };

    const modalBg: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    };
    const modalBox: React.CSSProperties = {
        background: 'var(--card-bg, #fff)', borderRadius: '1rem', padding: '2rem',
        width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    };
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
        border: '1px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box',
    };
    const fieldLabel: React.CSSProperties = {
        display: 'block', fontSize: '0.82rem', fontWeight: 600,
        color: 'var(--foreground, #111)', marginBottom: '0.3rem',
    };

    return (
        <div style={{ padding: '2.5rem' }}>
            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999, background: '#1e293b', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: '0.75rem', fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
                    {toast}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--muted-foreground, #6b7280)', fontSize: '0.9rem', textDecoration: 'none' }}>
                        <ArrowLeft size={16} /> Settings
                    </Link>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary, #3b82f6)' }}>
                        <Users size={28} /> User Management
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn-primary-large"
                        onClick={handleRepair}
                        disabled={repairing}
                        style={{ background: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem', minHeight: '40px' }}
                        title="Create missing standard accounts (Arjun.Supv, Ramesh.Kumar, Deepa.QC)"
                    >
                        <RefreshCw size={16} style={{ animation: repairing ? 'spin 1s linear infinite' : undefined }} />
                        {repairing ? 'Repairing...' : 'Repair Accounts'}
                    </button>
                    <button
                        className="btn-primary-large"
                        onClick={() => setShowCreate(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minHeight: '40px' }}
                    >
                        <UserPlus size={16} /> New User
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    placeholder="Search username, name, email…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ ...inputStyle, width: '220px' }}
                />
                <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    style={{ ...inputStyle, width: '160px' }}
                >
                    <option value="">All roles</option>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                    Show inactive
                </label>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Error */}
            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', color: '#991b1b', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            {/* Table */}
            <div style={{ background: 'var(--surface, #fff)', borderRadius: '1rem', border: '1px solid var(--card-border, #e5e7eb)', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            {['Username', 'Display Name', 'Role', 'Email', 'Status', 'Last Login', 'Actions'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading…</td></tr>
                        ) : users.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No users found</td></tr>
                        ) : users.map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: u.isActive ? 1 : 0.6 }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.9rem' }}>
                                    {u.username}
                                    {u.mustChangePassword && <span title="Must change password" style={{ marginLeft: '0.4rem', color: '#f59e0b', fontSize: '0.7rem' }}>⚠ pwd</span>}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.88rem', color: '#374151' }}>{u.displayName ?? '—'}</td>
                                <td style={{ padding: '0.75rem 1rem' }}><span style={pill(u.role)}>{u.role}</span></td>
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#6b7280' }}>{u.email ?? '—'}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span style={statusPill(u.isActive)}>{u.isActive ? 'Active' : 'Inactive'}</span>{' '}
                                    <span title={u.mfaEnabled ? 'MFA enrolled' : 'MFA not yet enrolled — required at next login'} style={{ ...statusPill(u.mfaEnabled), marginLeft: '4px' }}>
                                        {u.mfaEnabled ? 'MFA on' : 'MFA pending'}
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => openEdit(u)}
                                            title="Edit role / details"
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Shield size={12} /> Edit
                                        </button>
                                        <button
                                            onClick={() => { setResetTarget(u); setResetMode('force_change'); setNewPwd(''); }}
                                            title="Force password reset"
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #fbbf24', background: '#fffbeb', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', color: '#92400e' }}
                                        >
                                            <Key size={12} /> Reset Pwd
                                        </button>
                                        {u.mfaEnabled && (
                                            <button
                                                onClick={() => handleResetMfa(u)}
                                                disabled={resettingMfaId === u.id}
                                                title="Clear MFA enrollment and force re-enrollment (for a lost/wiped authenticator device)"
                                                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', color: '#991b1b', opacity: resettingMfaId === u.id ? 0.6 : 1 }}
                                            >
                                                <ShieldOff size={12} /> {resettingMfaId === u.id ? 'Resetting…' : 'Reset MFA'}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => toggleActive(u)}
                                            title={u.isActive ? 'Deactivate account' : 'Activate account'}
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${u.isActive ? '#fecaca' : '#bbf7d0'}`, background: u.isActive ? '#fff5f5' : '#f0fdf4', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', color: u.isActive ? '#991b1b' : '#14532d' }}
                                        >
                                            {u.isActive ? <><ToggleRight size={12} /> Deactivate</> : <><ToggleLeft size={12} /> Activate</>}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Create User Modal ─────────────────────────────────────────────── */}
            {showCreate && (
                <div style={modalBg} onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
                    <div style={modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Create User</h2>
                            <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={22} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {([
                                { label: 'Username *',    key: 'username',    type: 'text',     placeholder: 'e.g. john.smith' },
                                { label: 'Password *',    key: 'password',    type: 'password', placeholder: 'Min 8 characters' },
                                { label: 'Display Name',  key: 'displayName', type: 'text',     placeholder: 'Full name' },
                                { label: 'Email',         key: 'email',       type: 'email',    placeholder: 'user@company.com' },
                            ] as const).map(({ label, key, type, placeholder }) => (
                                <div key={key}>
                                    <label style={fieldLabel}>{label}</label>
                                    <input
                                        type={type}
                                        placeholder={placeholder}
                                        value={(newUser as any)[key]}
                                        onChange={e => setNewUser(u => ({ ...u, [key]: e.target.value }))}
                                        style={inputStyle}
                                    />
                                </div>
                            ))}
                            <div>
                                <label style={fieldLabel}>Role *</label>
                                <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value as Role }))} style={inputStyle}>
                                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={newUser.mustChangePassword} onChange={e => setNewUser(u => ({ ...u, mustChangePassword: e.target.checked }))} />
                                Require password change on first login
                            </label>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setShowCreate(false)} style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button onClick={handleCreate} disabled={creating || !newUser.username || !newUser.password} className="btn-primary-large" style={{ minHeight: '40px' }}>
                                    {creating ? 'Creating…' : <><Check size={16} /> Create User</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit User Modal ───────────────────────────────────────────────── */}
            {editTarget && editDraft && (
                <div style={modalBg} onClick={e => { if (e.target === e.currentTarget) setEditTarget(null); }}>
                    <div style={modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Edit: {editTarget.username}</h2>
                            <button onClick={() => setEditTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={22} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={fieldLabel}>Role</label>
                                <select value={editDraft.role} onChange={e => setEditDraft(d => d && { ...d, role: e.target.value as Role })} style={inputStyle}>
                                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={fieldLabel}>Display Name</label>
                                <input value={editDraft.displayName} onChange={e => setEditDraft(d => d && { ...d, displayName: e.target.value })} style={inputStyle} placeholder="Full name" />
                            </div>
                            <div>
                                <label style={fieldLabel}>Email</label>
                                <input type="email" value={editDraft.email} onChange={e => setEditDraft(d => d && { ...d, email: e.target.value })} style={inputStyle} placeholder="user@company.com" />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setEditTarget(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button onClick={handleSaveEdit} disabled={saving} className="btn-primary-large" style={{ minHeight: '40px' }}>
                                    {saving ? 'Saving…' : <><Check size={16} /> Save</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reset Password Modal ──────────────────────────────────────────── */}
            {resetTarget && (
                <div style={modalBg} onClick={e => { if (e.target === e.currentTarget) setResetTarget(null); }}>
                    <div style={modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Reset Password: {resetTarget.username}</h2>
                            <button onClick={() => setResetTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={22} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={fieldLabel}>Reset Mode</label>
                                <select value={resetMode} onChange={e => setResetMode(e.target.value as any)} style={inputStyle}>
                                    <option value="force_change">Force change on next login</option>
                                    <option value="set_password">Set specific password</option>
                                </select>
                            </div>
                            {resetMode === 'set_password' && (
                                <div>
                                    <label style={fieldLabel}>New Password (min 8 chars)</label>
                                    <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} style={inputStyle} placeholder="New password" />
                                </div>
                            )}
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280', background: '#f9fafb', padding: '0.75rem', borderRadius: '0.5rem' }}>
                                {resetMode === 'force_change'
                                    ? 'The user will be required to set a new password on their next login. Their current session will be invalidated.'
                                    : 'You are setting a temporary password. The user will be required to change it on next login.'}
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setResetTarget(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button
                                    onClick={handleReset}
                                    disabled={resetting || (resetMode === 'set_password' && newPwd.length < 8)}
                                    style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#f59e0b', cursor: 'pointer', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: (resetting || (resetMode === 'set_password' && newPwd.length < 8)) ? 0.6 : 1 }}
                                >
                                    {resetting ? 'Resetting…' : <><Key size={14} /> Reset Password</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
