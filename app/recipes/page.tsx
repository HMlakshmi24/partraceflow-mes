'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, CheckCircle, Clock, Cpu, Package, ChevronRight, X, AlertCircle, Download, Settings, Search, Tag } from 'lucide-react';

interface RecipeParameter {
    id: string;
    parameterName: string;
    unit?: string;
    nominalValue: string;
    minValue?: string;
    maxValue?: string;
    tolerance?: number;
    isSetpoint: boolean;
    plcAddress?: string;
    sequence: number;
}

interface Recipe {
    id: string;
    code: string;
    name: string;
    status: 'DRAFT' | 'APPROVED' | 'OBSOLETE';
    description?: string;
    createdBy: string;
    approvedBy?: string;
    approvedAt?: string;
    createdAt: string;
    parameters: RecipeParameter[];
    product?: { id: string; name: string; sku: string };
    machineAssignments?: { machine: { id: string; name: string }; status: string }[];
}

interface Product { id: string; name: string; sku: string; }
interface Machine { id: string; name: string; }

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    DRAFT: { bg: '#fef3c7', color: '#92400e', label: 'Draft' },
    APPROVED: { bg: '#d1fae5', color: '#065f46', label: 'Approved' },
    OBSOLETE: { bg: '#f3f4f6', color: 'var(--muted-foreground)', label: 'Obsolete' },
};

export default function RecipesPage() {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [selected, setSelected] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [showCreate, setShowCreate] = useState(false);
    const [showAssign, setShowAssign] = useState(false);
    const [assignMachineId, setAssignMachineId] = useState('');
    const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    // Create form state
    const [form, setForm] = useState({ code: '', name: '', productId: '', description: '' });
    const [params, setParams] = useState<Partial<RecipeParameter>[]>([
        { parameterName: '', unit: '', nominalValue: '', minValue: '', maxValue: '', isSetpoint: true, sequence: 1 }
    ]);

    const load = useCallback(async () => {
        setLoading(true);
        const r = await fetch('/api/recipes');
        const d = await r.json();
        setRecipes(d.recipes ?? []);
        setProducts(d.products ?? []);
        setMachines(d.machines ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const loadDetail = async (recipeId: string) => {
        const r = await fetch(`/api/recipes?id=${recipeId}`);
        const d = await r.json();
        if (d.recipe) setSelected(d.recipe);
    };

    const toast = (type: 'ok' | 'err', text: string) => {
        setActionMsg({ type, text });
        setTimeout(() => setActionMsg(null), 3500);
    };

    const doApprove = async (recipeId: string) => {
        const r = await fetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', recipeId }) });
        if (r.ok) { toast('ok', 'Recipe approved'); load(); if (selected?.id === recipeId) loadDetail(recipeId); }
        else toast('err', 'Approval failed');
    };

    const doAssign = async () => {
        if (!selected || !assignMachineId) return;
        const r = await fetch('/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign_machine', recipeId: selected.id, machineId: assignMachineId }) });
        if (r.ok) { toast('ok', 'Recipe assigned to machine'); setShowAssign(false); setAssignMachineId(''); load(); loadDetail(selected.id); }
        else toast('err', 'Assignment failed');
    };

    const doCreate = async () => {
        if (!form.code || !form.name || !form.productId) { toast('err', 'Code, name and product are required'); return; }
        const r = await fetch('/api/recipes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', ...form, parameters: params.filter(p => p.parameterName) })
        });
        if (r.ok) {
            toast('ok', 'Recipe created');
            setShowCreate(false);
            setForm({ code: '', name: '', productId: '', description: '' });
            setParams([{ parameterName: '', unit: '', nominalValue: '', minValue: '', maxValue: '', isSetpoint: true, sequence: 1 }]);
            load();
        } else toast('err', 'Create failed');
    };

    const filtered = recipes.filter(r => {
        if (filterStatus && r.status !== filterStatus) return false;
        if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.code.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const updateParam = (i: number, key: string, val: any) => {
        setParams(prev => prev.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
    };

    const inputStyle = { width: '100%', padding: '0.55rem 0.75rem', borderRadius: '0.4rem', border: '1.5px solid var(--card-border)', fontSize: '0.9rem', boxSizing: 'border-box' as const, outline: 'none', background: 'var(--card-bg)', color: 'var(--foreground)' };

    return (
        <div style={{ padding: '1.5rem', fontFamily: 'inherit', background: 'var(--background)', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <BookOpen size={24} color="#10b981" /> Machine Recipes
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        Process recipes with version control, approval workflow and PLC setpoint download
                    </p>
                </div>
                <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                    <Plus size={16} /> New Recipe
                </button>
            </div>

            {actionMsg && (
                <div style={{ background: actionMsg.type === 'ok' ? '#d1fae5' : '#fee2e2', border: `1px solid ${actionMsg.type === 'ok' ? '#6ee7b7' : '#fca5a5'}`, borderRadius: '0.6rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: actionMsg.type === 'ok' ? '#065f46' : '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    {actionMsg.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />} {actionMsg.text}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.25rem', alignItems: 'start' }}>
                {/* Left — list */}
                <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    {/* Filters */}
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--card-border)' }}>
                        <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes…" style={{ ...inputStyle, paddingLeft: '2rem', fontSize: '0.85rem' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {['', 'DRAFT', 'APPROVED', 'OBSOLETE'].map(s => (
                                <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '0.25rem 0.65rem', borderRadius: '999px', border: '1px solid var(--card-border)', background: filterStatus === s ? '#3b82f6' : 'var(--surface-muted)', color: filterStatus === s ? 'var(--card-bg)' : 'var(--foreground)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                    {s || 'All'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>No recipes found</div>
                    ) : filtered.map(recipe => {
                        const st = STATUS_STYLE[recipe.status] ?? STATUS_STYLE.DRAFT;
                        return (
                            <div key={recipe.id} onClick={() => loadDetail(recipe.id)} style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--card-border)', cursor: 'pointer', background: selected?.id === recipe.id ? 'rgba(59,130,246,0.1)' : 'transparent', borderLeft: selected?.id === recipe.id ? '3px solid #3b82f6' : '3px solid transparent' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{recipe.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontFamily: 'monospace', marginTop: '0.1rem' }}>{recipe.code}</div>
                                    </div>
                                    <span style={{ padding: '2px 8px', borderRadius: '999px', background: st.bg, color: st.color, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, marginLeft: '0.5rem' }}>{st.label}</span>
                                </div>
                                {recipe.product && (
                                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <Tag size={10} /> {recipe.product.name} · {recipe.parameters.length} params
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Right — detail */}
                {selected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Header card */}
                        <div style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)', borderRadius: '1rem', padding: '1.5rem', color: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontSize: '0.78rem', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recipe</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.1rem' }}>{selected.name}</div>
                                    <div style={{ fontSize: '0.85rem', opacity: 0.75, fontFamily: 'monospace' }}>{selected.code}</div>
                                    {selected.description && <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>{selected.description}</div>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                                    <span style={{ padding: '4px 12px', borderRadius: '999px', background: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', fontWeight: 700 }}>
                                        {STATUS_STYLE[selected.status]?.label ?? selected.status}
                                    </span>
                                    {selected.status === 'DRAFT' && (
                                        <button onClick={() => doApprove(selected.id)} style={{ padding: '0.5rem 1rem', borderRadius: '0.4rem', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <CheckCircle size={14} /> Approve
                                        </button>
                                    )}
                                    {selected.status === 'APPROVED' && (
                                        <button onClick={() => setShowAssign(true)} style={{ padding: '0.5rem 1rem', borderRadius: '0.4rem', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Cpu size={14} /> Assign to Machine
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', fontSize: '0.82rem', opacity: 0.85 }}>
                                <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Product</div><div style={{ fontWeight: 600 }}>{selected.product?.name ?? '—'}</div></div>
                                <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Created by</div><div style={{ fontWeight: 600 }}>{selected.createdBy}</div></div>
                                {selected.approvedBy && <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Approved by</div><div style={{ fontWeight: 600 }}>{selected.approvedBy}</div></div>}
                            </div>
                        </div>

                        {/* Parameters table */}
                        <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Settings size={16} color="#10b981" /> Process Parameters ({selected.parameters.length})
                            </div>
                            {selected.parameters.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>No parameters defined</div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface-muted)' }}>
                                                {['Seq', 'Parameter', 'Nominal', 'Min', 'Max', 'Unit', 'Setpoint', 'PLC Addr'].map(h => (
                                                    <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', fontSize: '0.78rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selected.parameters.map(p => (
                                                <tr key={p.id} style={{ borderTop: '1px solid var(--card-border)' }}>
                                                    <td style={{ padding: '0.6rem 1rem', color: '#9ca3af' }}>{p.sequence}</td>
                                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{p.parameterName}</td>
                                                    <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', color: '#3b82f6', fontWeight: 700 }}>{p.nominalValue}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--muted-foreground)' }}>{p.minValue ?? '—'}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--muted-foreground)' }}>{p.maxValue ?? '—'}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--muted-foreground)' }}>{p.unit ?? '—'}</td>
                                                    <td style={{ padding: '0.6rem 1rem' }}>
                                                        {p.isSetpoint
                                                            ? <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontSize: '0.72rem', fontWeight: 700 }}>Yes</span>
                                                            : <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#f3f4f6', color: 'var(--muted-foreground)', fontSize: '0.72rem' }}>No</span>}
                                                    </td>
                                                    <td style={{ padding: '0.6rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#9ca3af' }}>{p.plcAddress ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Machine Assignments */}
                        {selected.machineAssignments && selected.machineAssignments.length > 0 && (
                            <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Cpu size={16} color="#3b82f6" /> Active Machine Assignments
                                </div>
                                {selected.machineAssignments.map((a, i) => (
                                    <div key={i} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 600 }}>{a.machine.name}</div>
                                        <span style={{ padding: '2px 10px', borderRadius: '999px', background: '#dbeafe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700 }}>{a.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', border: '1px solid var(--card-border)', padding: '4rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                        <BookOpen size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Select a recipe to view details</p>
                        <p style={{ fontSize: '0.85rem' }}>Parameters, version history, machine assignments</p>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Create New Recipe</h2>
                            <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                            {[['Code', 'code', 'e.g. RCP-001'], ['Name', 'name', 'e.g. Aluminium Milling v1']].map(([lbl, key, ph]) => (
                                <div key={key}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--foreground)' }}>{lbl}</label>
                                    <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inputStyle} />
                                </div>
                            ))}
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--foreground)' }}>Product</label>
                                <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} style={{ ...inputStyle, color: 'var(--foreground)', background: 'var(--card-bg)' }}>
                                    <option value="" style={{ color: 'var(--foreground)' }}>Select product…</option>
                                    {products.map(p => <option key={p.id} value={p.id} style={{ color: 'var(--foreground)' }}>{p.name} ({p.sku})</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--foreground)' }}>Description</label>
                                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional…" style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Parameters</div>
                                <button onClick={() => setParams(p => [...p, { parameterName: '', unit: '', nominalValue: '', isSetpoint: true, sequence: p.length + 1 }])} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: '1px solid var(--card-border)', background: 'var(--surface-muted)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                                    + Add
                                </button>
                            </div>
                            {params.map((p, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr 0.8fr auto', gap: '0.4rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                    <input value={p.parameterName ?? ''} onChange={e => updateParam(i, 'parameterName', e.target.value)} placeholder="Parameter name" style={{ ...inputStyle, fontSize: '0.82rem' }} />
                                    <input value={p.nominalValue ?? ''} onChange={e => updateParam(i, 'nominalValue', e.target.value)} placeholder="Nominal" style={{ ...inputStyle, fontSize: '0.82rem' }} />
                                    <input value={p.minValue ?? ''} onChange={e => updateParam(i, 'minValue', e.target.value)} placeholder="Min" style={{ ...inputStyle, fontSize: '0.82rem' }} />
                                    <input value={p.maxValue ?? ''} onChange={e => updateParam(i, 'maxValue', e.target.value)} placeholder="Max" style={{ ...inputStyle, fontSize: '0.82rem' }} />
                                    <input value={p.unit ?? ''} onChange={e => updateParam(i, 'unit', e.target.value)} placeholder="Unit" style={{ ...inputStyle, fontSize: '0.82rem' }} />
                                    <button onClick={() => setParams(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }}><X size={14} /></button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCreate(false)} style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={doCreate} style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Create Recipe</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Machine Modal */}
            {showAssign && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', padding: '1.5rem', width: 400 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontWeight: 700 }}>Assign to Machine</h3>
                            <button onClick={() => setShowAssign(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Assigning: <strong>{selected?.name}</strong></p>
                        <select value={assignMachineId} onChange={e => setAssignMachineId(e.target.value)} style={{ ...inputStyle, color: 'var(--foreground)', background: 'var(--card-bg)', marginBottom: '1rem' }}>
                            <option value="" style={{ color: 'var(--foreground)' }}>Select machine…</option>
                            {machines.map(m => <option key={m.id} value={m.id} style={{ color: 'var(--foreground)' }}>{m.name}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowAssign(false)} style={{ padding: '0.6rem 1rem', borderRadius: '0.4rem', border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={doAssign} disabled={!assignMachineId} style={{ padding: '0.6rem 1.25rem', borderRadius: '0.4rem', border: 'none', background: assignMachineId ? '#3b82f6' : 'var(--card-border)', color: assignMachineId ? 'var(--card-bg)' : '#9ca3af', cursor: assignMachineId ? 'pointer' : 'not-allowed', fontWeight: 700 }}>Assign</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
