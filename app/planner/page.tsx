'use client';

import { useEffect, useState, useTransition, useRef } from 'react';
import { createManufacturingOrder } from '@/lib/actions/erp';
import {
    ShoppingCart, Search, Eye, Printer, X, CheckCircle, Clock,
    AlertCircle, Ban, Plus, Package, Play, Send, Pause, RefreshCw,
    Activity, User, Cpu, FileText, Zap, ChevronRight,
} from 'lucide-react';
import styles from './planner.module.css';
import {
    STATUS_LABELS, STATUS_COLORS, ACTION_BUTTONS, getNextActions, isTerminal,
} from '@/lib/orderStateMachine';

// ── Status colour + icon helpers ─────────────────────────────────────────────

const STATUS_ICONS: Record<string, React.ReactNode> = {
    PLANNED:     <Clock    size={12} />,
    RELEASED:    <Send     size={12} />,
    IN_PROGRESS: <Play     size={12} />,
    QC_PENDING:  <Activity size={12} />,
    APPROVED:    <CheckCircle size={12} />,
    REWORK:      <RefreshCw  size={12} />,
    ON_HOLD:     <Pause    size={12} />,
    COMPLETED:   <CheckCircle size={12} />,
    CANCELLED:   <Ban      size={12} />,
};

const STATUS_TABS = [
    { key: 'All Status',  label: 'All'         },
    { key: 'PLANNED',     label: 'Planned'      },
    { key: 'RELEASED',    label: 'Released'     },
    { key: 'IN_PROGRESS', label: 'In Progress'  },
    { key: 'QC_PENDING',  label: 'QC Pending'   },
    { key: 'REWORK',      label: 'Rework'       },
    { key: 'COMPLETED',   label: 'Completed'    },
    { key: 'ON_HOLD',     label: 'On Hold'      },
    { key: 'CANCELLED',   label: 'Cancelled'    },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function OrderStatusBadge({ status }: { status: string }) {
    const color = STATUS_COLORS[status] ?? '#64748b';
    const label = STATUS_LABELS[status]  ?? status;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 12px', borderRadius: 999,
            background: color + '18', color,
            fontSize: 11, fontWeight: 800,
            border: `1px solid ${color}40`,
            whiteSpace: 'nowrap' as const,
        }}>
            {STATUS_ICONS[status]}
            {label}
        </span>
    );
}

function StatCard({ label, value, color, icon: Icon }: {
    label: string; value: number; color: string; icon: any;
}) {
    return (
        <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: 'var(--shadow-soft)',
        }}>
            <div style={{ width: 40, height: 40, borderRadius: 9, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} color={color} />
            </div>
            <div>
                <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</div>
            </div>
        </div>
    );
}

// Activity timeline item
function ActivityItem({ act, isLast }: { act: any; isLast: boolean }) {
    const color = act.toStatus ? (STATUS_COLORS[act.toStatus] ?? '#64748b') : '#64748b';
    const isQC   = act.action === 'QC_RESULT';
    const isNote = act.action === 'NOTE';
    const dotColor = isQC ? (act.notes?.includes('FAILED') ? '#ef4444' : '#10b981') : (isNote ? '#f59e0b' : color);

    return (
        <div style={{ display: 'flex', gap: 12, position: 'relative' as const }}>
            {/* connector line */}
            {!isLast && (
                <div style={{ position: 'absolute' as const, left: 11, top: 26, width: 2, height: 'calc(100% + 8px)', background: 'var(--card-border)', zIndex: 0 }} />
            )}
            {/* dot */}
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: dotColor + '22', border: `2px solid ${dotColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                {isQC ? <Activity size={11} color={dotColor} /> : isNote ? <FileText size={11} color={dotColor} /> : <ChevronRight size={11} color={dotColor} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    {act.fromStatus && act.toStatus && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <OrderStatusBadge status={act.fromStatus} />
                            <ChevronRight size={12} color="var(--muted-foreground)" />
                            <OrderStatusBadge status={act.toStatus} />
                        </div>
                    )}
                    {(!act.fromStatus || !act.toStatus) && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: dotColor, background: dotColor + '18', padding: '2px 8px', borderRadius: 999 }}>
                            {act.action === 'QC_RESULT' ? 'QC Result' : act.action === 'NOTE' ? 'Note' : act.action}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--foreground)', fontWeight: 500, lineHeight: 1.5, marginBottom: 4 }}>
                    {act.notes}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>
                    {act.performedBy && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <User size={10} /> {act.performedBy}
                            {act.role && <span style={{ opacity: 0.6 }}>({act.role})</span>}
                        </span>
                    )}
                    {act.machine && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Cpu size={10} /> {act.machine}
                        </span>
                    )}
                    <span>{new Date(act.timestamp).toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PlannerPage() {
    const [products,     setProducts]     = useState<any[]>([]);
    const [orders,       setOrders]       = useState<any[]>([]);
    const [filtered,     setFiltered]     = useState<any[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [searchText,   setSearchText]   = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');
    const [page, setPage]                 = useState(1);
    const PAGE_SIZE = 8;

    const [viewOrder,    setViewOrder]    = useState<any>(null);
    const [activities,   setActivities]   = useState<any[]>([]);
    const [activeTab,    setActiveTab]    = useState<'details' | 'timeline'>('details');

    const [msg, setMsg]               = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [isPending, startTransition] = useTransition();

    // Demo Mode auto-simulation
    const [demoMode,     setDemoMode]    = useState(false);
    const [demoRunning,  setDemoRunning] = useState(false);
    const demoRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
        setMsg({ text, type });
        setTimeout(() => setMsg(null), 4000);
    };

    const loadData = async () => {
        try {
            const res = await fetch('/api/orders').catch(() => null);
            if (res?.ok) {
                const data = await res.json();
                setProducts(data.products || []);
                setOrders(data.orders   || []);
            } else {
                setProducts([
                    { id: '1', sku: 'PMP-HG-101', name: 'Pump Housing Assembly' },
                    { id: '2', sku: 'VLV-WU-202', name: 'Valve Welding Unit'     },
                ]);
            }
        } finally { setIsLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        let result = [...orders];
        const q = searchText.trim().toLowerCase();
        if (q) result = result.filter(o =>
            o.orderNumber?.toLowerCase().includes(q) ||
            o.product?.name?.toLowerCase().includes(q) ||
            o.product?.sku?.toLowerCase().includes(q)
        );
        if (statusFilter !== 'All Status') result = result.filter(o => o.status === statusFilter);
        setFiltered(result);
        setPage(1);
    }, [searchText, statusFilter, orders]);

    // Demo Mode interval
    useEffect(() => {
        if (demoMode && !demoRef.current) {
            setDemoRunning(true);
            demoRef.current = setInterval(async () => {
                try {
                    const res = await fetch('/api/demo/simulate', { method: 'POST' });
                    const data = await res.json();
                    if (data.updates?.length > 0) {
                        showMsg(`[Demo] ${data.updates.map((u: any) => `${u.orderNumber}: ${u.from} → ${u.to}`).join(' | ')}`);
                    }
                    await loadData();
                    // Refresh open modal if any
                    if (viewOrder?.id) {
                        const r = await fetch(`/api/orders/${viewOrder.id}`);
                        const d = await r.json();
                        setViewOrder(d);
                        const ra = await fetch(`/api/orders/${viewOrder.id}/activity`);
                        setActivities(await ra.json());
                    }
                } catch {}
            }, 8000); // every 8s
        }
        if (!demoMode && demoRef.current) {
            clearInterval(demoRef.current);
            demoRef.current = null;
            setDemoRunning(false);
        }
        return () => {};
    }, [demoMode]);

    // Cleanup on unmount
    useEffect(() => () => { if (demoRef.current) clearInterval(demoRef.current); }, []);

    const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageOrders   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleView = async (id: string) => {
        setViewOrder({ loading: true });
        setActivities([]);
        setActiveTab('details');
        try {
            const [orderRes, actRes] = await Promise.all([
                fetch(`/api/orders/${id}`),
                fetch(`/api/orders/${id}/activity`),
            ]);
            setViewOrder(await orderRes.json());
            setActivities(await actRes.json());
        } catch { setViewOrder(null); }
    };

    const handlePrint = (order: any) => {
        const w = window.open('', '_blank');
        if (!w) return;
        (w.document as any).write(`
            <html><head><title>Work Order ${order.orderNumber}</title>
            <style>body{font-family:monospace;padding:20px} h1{font-size:18px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #999;padding:8px} @media print{button{display:none}}</style>
            </head><body>
            <h1>WORK ORDER: ${order.orderNumber}</h1>
            <table>
              <tr><th>Field</th><th>Value</th></tr>
              <tr><td>Product</td><td>${order.product?.name} (${order.product?.sku})</td></tr>
              <tr><td>Quantity</td><td>${order.quantity}</td></tr>
              <tr><td>Status</td><td>${STATUS_LABELS[order.status] ?? order.status}</td></tr>
              <tr><td>Due Date</td><td>${new Date(order.dueDate).toLocaleDateString()}</td></tr>
              <tr><td>Created</td><td>${new Date(order.createdAt).toLocaleString()}</td></tr>
            </table>
            <br/><p>Printed: ${new Date().toLocaleString()}</p>
            <button onclick="window.print()">Print</button>
            </body></html>
        `);
        w.document.close();
    };

    const handleStatusChange = async (id: string, newStatus: string, orderNumber?: string) => {
        try {
            const res = await fetch(`/api/orders/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const data = await res.json();
            if (res.ok) {
                showMsg(`${orderNumber ?? 'Order'} → ${STATUS_LABELS[newStatus] ?? newStatus}`);
                await loadData();
                if (viewOrder?.id === id) await handleView(id);
            } else {
                showMsg(data.error ?? 'Failed to update status', 'error');
            }
        } catch {
            showMsg('Network error — please try again', 'error');
        }
    };

    return (
        <div className={styles.productionPlanner}>

            {/* Toast */}
            {msg && (
                <div style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 1001,
                    padding: '0.85rem 1.4rem', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.9rem',
                    background: msg.type === 'success' ? '#10b981' : '#ef4444', color: '#fff',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 8,
                    maxWidth: 500,
                }}>
                    {msg.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {msg.text}
                </div>
            )}

            {/* Page Header */}
            <div style={{
                background: 'linear-gradient(135deg,#0b1220 0%,#1e3a5f 60%,#1e86ff 100%)',
                borderRadius: '1.25rem', padding: '1.5rem 2rem', marginBottom: '1.5rem',
                boxShadow: '0 8px 30px rgba(14,60,120,0.3)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShoppingCart size={20} color="#fff" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, color: '#fff', fontSize: '1.6rem', fontWeight: 900 }}>
                                Work Orders
                                {orders.length > 0 && (
                                    <span style={{ marginLeft: 10, fontSize: '0.95rem', padding: '2px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', verticalAlign: 'middle' }}>
                                        {orders.length}
                                    </span>
                                )}
                            </h1>
                            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Release, track and enforce order lifecycle on the shop floor</p>
                        </div>
                    </div>

                    {/* Demo Mode Toggle */}
                    <button
                        onClick={() => setDemoMode(d => !d)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '0.55rem 1.2rem', borderRadius: 999,
                            border: `2px solid ${demoMode ? '#10b981' : 'rgba(255,255,255,0.35)'}`,
                            background: demoMode ? '#10b98122' : 'rgba(255,255,255,0.1)',
                            color: demoMode ? '#10b981' : '#fff',
                            fontWeight: 800, fontSize: 13, cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <Zap size={14} style={{ animation: demoRunning ? 'pulse 1s infinite' : 'none' }} />
                        Demo Mode: {demoMode ? 'ON' : 'OFF'}
                        {demoRunning && <span style={{ fontSize: 10, opacity: 0.75 }}>auto-simulating…</span>}
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)', fontWeight: 600 }}>Loading work orders…</div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
                        <StatCard label="Planned"     value={orders.filter(o => o.status === 'PLANNED').length}     color="#64748b" icon={Clock}       />
                        <StatCard label="Released"    value={orders.filter(o => o.status === 'RELEASED').length}    color="#3b82f6" icon={Send}        />
                        <StatCard label="In Progress" value={orders.filter(o => o.status === 'IN_PROGRESS').length} color="#f59e0b" icon={Play}        />
                        <StatCard label="QC Pending"  value={orders.filter(o => o.status === 'QC_PENDING').length}  color="#a855f7" icon={Activity}    />
                        <StatCard label="Rework"      value={orders.filter(o => o.status === 'REWORK').length}      color="#f97316" icon={RefreshCw}   />
                        <StatCard label="Completed"   value={orders.filter(o => o.status === 'COMPLETED').length}   color="#10b981" icon={CheckCircle} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1.5rem' }}>

                        {/* CREATE ORDER FORM */}
                        <section className={styles.formSection}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.1rem' }}>
                                <Plus size={17} color="#1e86ff" />
                                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Release New Work Order</h2>
                            </div>

                            <form action={async (fd) => {
                                startTransition(async () => {
                                    try {
                                        await createManufacturingOrder(fd);
                                        showMsg('Order released to shop floor!');
                                        await loadData();
                                    } catch (e: any) {
                                        showMsg(e.message || 'Failed to create order', 'error');
                                    }
                                });
                            }}>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Order Number</label>
                                        <input name="orderNumber" defaultValue={`WO-${Date.now().toString().slice(-6)}`} required className={styles.formInput} style={{ minHeight: 42 }} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Product</label>
                                        <select name="productId" required className={styles.formSelect} style={{ minHeight: 42 }}>
                                            {products.map((p: any) => (
                                                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Quantity</label>
                                        <input name="quantity" type="number" defaultValue="100" required className={styles.formInput} style={{ minHeight: 42 }} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Priority</label>
                                        <select name="priority" className={styles.formSelect} style={{ minHeight: 42 }}>
                                            <option value="1">1 — Low</option>
                                            <option value="2">2 — Normal</option>
                                            <option value="3" selected>3 — High</option>
                                            <option value="4">4 — URGENT</option>
                                        </select>
                                    </div>
                                </div>
                                <button type="submit" className={styles.submitButton} disabled={isPending} style={{ width: '100%', minHeight: 48, fontSize: '1rem' }}>
                                    {isPending ? 'Releasing to Shop Floor…' : 'Release to Shop Floor'}
                                </button>
                            </form>

                            {/* State Machine Legend */}
                            <div style={{ marginTop: '1.25rem', padding: '0.9rem 1rem', background: 'var(--surface-muted)', borderRadius: '0.65rem', border: '1px solid var(--card-border)' }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>
                                    Order Lifecycle
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, alignItems: 'center', fontSize: 11 }}>
                                    {['PLANNED','RELEASED','IN_PROGRESS','QC_PENDING','APPROVED','COMPLETED'].map((s, i, arr) => (
                                        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                            <span style={{ padding: '2px 8px', borderRadius: 999, background: STATUS_COLORS[s] + '18', color: STATUS_COLORS[s], fontWeight: 700, fontSize: 10 }}>{STATUS_LABELS[s]}</span>
                                            {i < arr.length - 1 && <ChevronRight size={10} color="var(--muted-foreground)" />}
                                        </span>
                                    ))}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 6 }}>
                                    QC Pending may go to <span style={{ color: STATUS_COLORS['REWORK'] }}>Rework</span> → back to In Progress
                                </div>
                            </div>
                        </section>

                        {/* ORDER LIST */}
                        <section className={styles.tableSection}>
                            <div className={styles.tableTitleRow}>
                                <div>
                                    <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Work Order History</h2>
                                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{filtered.length} order{filtered.length !== 1 ? 's' : ''} shown</p>
                                </div>
                                <div style={{ position: 'relative' as const }}>
                                    <Search size={13} style={{ position: 'absolute' as const, left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                                    <input placeholder="Search orders…" value={searchText} onChange={e => setSearchText(e.target.value)}
                                        className={styles.filterSelect}
                                        style={{ width: 190, paddingLeft: '2rem', minHeight: 40, fontSize: 13 }} />
                                </div>
                            </div>

                            {/* Status tabs */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
                                {STATUS_TABS.map(tab => {
                                    const active = statusFilter === tab.key;
                                    const color = tab.key !== 'All Status' ? (STATUS_COLORS[tab.key] ?? '#64748b') : '#3b82f6';
                                    const count = tab.key === 'All Status' ? orders.length : orders.filter(o => o.status === tab.key).length;
                                    if (count === 0 && tab.key !== 'All Status' && tab.key !== statusFilter) return null;
                                    return (
                                        <button key={tab.key} onClick={() => setStatusFilter(tab.key)} style={{
                                            minHeight: 34, padding: '0 12px', borderRadius: 999,
                                            border: active ? `2px solid ${color}` : '1.5px solid var(--card-border)',
                                            background: active ? color + '18' : 'var(--card-bg)',
                                            color: active ? color : 'var(--muted-foreground)',
                                            fontWeight: active ? 800 : 600, fontSize: 12,
                                            cursor: 'pointer', transition: 'all 0.15s',
                                            display: 'flex', alignItems: 'center', gap: 5,
                                        }}>
                                            {tab.label}
                                            <span style={{ fontSize: 10, fontWeight: 800, padding: '0 5px', borderRadius: 999, background: active ? color + '28' : 'var(--surface-muted)', color: active ? color : 'var(--muted-foreground)' }}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Table */}
                            <div className={styles.tableWrapper}>
                                <table className={styles.ordersTable}>
                                    <thead className={styles.tableHeader}>
                                        <tr>
                                            <th>Order #</th>
                                            <th>Product</th>
                                            <th>Qty</th>
                                            <th>Status</th>
                                            <th>Due</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className={styles.tableBody}>
                                        {pageOrders.length === 0 ? (
                                            <tr><td colSpan={6}>
                                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>
                                                    <Package size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
                                                    <p style={{ margin: 0, fontWeight: 700 }}>
                                                        {orders.length === 0 ? 'No work orders yet.' : 'No orders match your filter.'}
                                                    </p>
                                                </div>
                                            </td></tr>
                                        ) : pageOrders.map((order: any) => (
                                            <tr key={order.id}>
                                                <td>
                                                    <span className={styles.orderNumber} style={{ fontSize: 13 }}>{order.orderNumber}</span>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{order.product?.name || 'Unknown'}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{order.product?.sku}</div>
                                                </td>
                                                <td style={{ fontSize: 14, fontWeight: 700 }}>{order.quantity}</td>
                                                <td><OrderStatusBadge status={order.status} /></td>
                                                <td style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                                                    {new Date(order.dueDate).toLocaleDateString()}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div className={styles.tableActions}>
                                                        <button className={styles.actionIcon} onClick={() => handleView(order.id)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <Eye size={12} /> View
                                                        </button>
                                                        <button className={styles.actionIcon} onClick={() => handlePrint(order)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <Printer size={12} /> Print
                                                        </button>
                                                        {!isTerminal(order.status) && (
                                                            <button className={styles.actionIcon}
                                                                onClick={() => { if (confirm(`Cancel ${order.orderNumber}?`)) handleStatusChange(order.id, 'CANCELLED', order.orderNumber); }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                                                                <X size={12} /> Cancel
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className={styles.pagination}>
                                <button className={styles.pageButton} disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ minHeight: 36 }}>&lt; Prev</button>
                                <span className={styles.pageInfo}>Page {page} / {totalPages}</span>
                                <button className={styles.pageButton} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ minHeight: 36 }}>Next &gt;</button>
                            </div>
                        </section>
                    </div>
                </>
            )}

            {/* ── VIEW ORDER MODAL ───────────────────────────────────────────── */}
            {viewOrder && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setViewOrder(null); }}
                >
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1.1rem', padding: '1.75rem',
                        width: '100%', maxWidth: '660px', maxHeight: '88vh', overflowY: 'auto',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
                    }}>
                        {/* Modal header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Work Order Details</h2>
                                {!viewOrder.loading && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{viewOrder.orderNumber}</p>}
                            </div>
                            <button onClick={() => setViewOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4 }}>
                                <X size={22} />
                            </button>
                        </div>

                        {viewOrder.loading ? (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>Loading…</div>
                        ) : (
                            <>
                                {/* Status badge */}
                                <div style={{ marginBottom: '1.1rem' }}>
                                    <OrderStatusBadge status={viewOrder.status} />
                                </div>

                                {/* Tab switcher */}
                                <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', background: 'var(--surface-muted)', borderRadius: '0.6rem', padding: 3 }}>
                                    {(['details', 'timeline'] as const).map(tab => (
                                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                                            flex: 1, padding: '7px 0', borderRadius: '0.45rem', border: 'none',
                                            background: activeTab === tab ? 'var(--card-bg)' : 'transparent',
                                            color: activeTab === tab ? 'var(--foreground)' : 'var(--muted-foreground)',
                                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                            boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                                            textTransform: 'capitalize' as const,
                                        }}>
                                            {tab === 'timeline' ? `Activity Timeline (${activities.length})` : 'Details'}
                                        </button>
                                    ))}
                                </div>

                                {activeTab === 'details' ? (
                                    <>
                                        {/* Details grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                            {[
                                                ['Order Number',  viewOrder.orderNumber],
                                                ['Product',       `${viewOrder.product?.name} (${viewOrder.product?.sku})`],
                                                ['Quantity',      viewOrder.quantity],
                                                ['Status',        STATUS_LABELS[viewOrder.status] ?? viewOrder.status],
                                                ['Due Date',      new Date(viewOrder.dueDate).toLocaleDateString()],
                                                ['Created',       new Date(viewOrder.createdAt).toLocaleString()],
                                            ].map(([label, value]) => (
                                                <div key={String(label)} style={{ background: 'var(--surface-muted)', borderRadius: '0.55rem', padding: '0.75rem 0.9rem' }}>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginBottom: '0.2rem', textTransform: 'uppercase' as const, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</div>
                                                    <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '0.9rem' }}>{String(value)}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Workflow steps */}
                                        {viewOrder.workflowInstances?.[0]?.tasks?.length > 0 && (
                                            <div style={{ marginBottom: '1.25rem' }}>
                                                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, marginBottom: '0.6rem' }}>Workflow Steps</h3>
                                                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' }}>
                                                    {viewOrder.workflowInstances[0].tasks.map((t: any, i: number) => (
                                                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.8rem', background: 'var(--surface-muted)', borderRadius: '0.55rem' }}>
                                                            <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.status === 'COMPLETED' ? '#10b981' : t.status === 'IN_PROGRESS' ? '#f59e0b' : 'var(--card-border)', color: ['COMPLETED','IN_PROGRESS'].includes(t.status) ? '#fff' : 'var(--muted-foreground)', fontSize: '0.75rem', fontWeight: 800 }}>
                                                                {t.status === 'COMPLETED' ? <CheckCircle size={13} /> : i + 1}
                                                            </div>
                                                            <div style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600 }}>{t.stepDef?.name || `Step ${i + 1}`}</div>
                                                            {t.operator && <span style={{ fontSize: 11, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 3 }}><User size={10} />{t.operator.username}</span>}
                                                            <OrderStatusBadge status={t.status} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    /* Activity Timeline */
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        {activities.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted-foreground)', fontSize: 13 }}>No activity recorded yet.</div>
                                        ) : (
                                            <div style={{ padding: '0.25rem 0' }}>
                                                {activities.map((act, i) => (
                                                    <ActivityItem key={act.id} act={act} isLast={i === activities.length - 1} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── State-machine action buttons ── */}
                                {!isTerminal(viewOrder.status) && (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.1rem' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>
                                            Next Actions
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' as const }}>
                                            <button onClick={() => handlePrint(viewOrder)}
                                                style={{ minHeight: 40, padding: '0 14px', borderRadius: '0.6rem', border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--foreground)', fontSize: 13 }}>
                                                <Printer size={14} /> Print
                                            </button>

                                            {getNextActions(viewOrder.status).map((nextStatus) => {
                                                const btn = ACTION_BUTTONS[nextStatus];
                                                if (!btn) return null;
                                                const isCancel = nextStatus === 'CANCELLED';
                                                const color = STATUS_COLORS[nextStatus] ?? '#64748b';
                                                return (
                                                    <button key={nextStatus}
                                                        onClick={() => {
                                                            if (isCancel && !confirm(`Cancel order ${viewOrder.orderNumber}?`)) return;
                                                            handleStatusChange(viewOrder.id, nextStatus, viewOrder.orderNumber);
                                                        }}
                                                        style={{
                                                            minHeight: 40, padding: '0 14px', borderRadius: '0.6rem',
                                                            border: isCancel ? 'none' : `1px solid ${color}40`,
                                                            background: isCancel ? '#ef4444' : color + '18',
                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                                            fontWeight: 700,
                                                            color: isCancel ? '#fff' : color,
                                                            fontSize: 13,
                                                        }}
                                                    >
                                                        {nextStatus === 'CANCELLED'   && <X size={14} />}
                                                        {nextStatus === 'IN_PROGRESS' && <Play size={14} />}
                                                        {nextStatus === 'QC_PENDING'  && <Activity size={14} />}
                                                        {nextStatus === 'APPROVED'    && <CheckCircle size={14} />}
                                                        {nextStatus === 'REWORK'      && <RefreshCw size={14} />}
                                                        {nextStatus === 'COMPLETED'   && <CheckCircle size={14} />}
                                                        {nextStatus === 'ON_HOLD'     && <Pause size={14} />}
                                                        {nextStatus === 'RELEASED'    && <Send size={14} />}
                                                        {btn.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {isTerminal(viewOrder.status) && (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', gap: 8 }}>
                                        <button onClick={() => handlePrint(viewOrder)}
                                            style={{ minHeight: 40, padding: '0 14px', borderRadius: '0.6rem', border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                                            <Printer size={14} /> Print
                                        </button>
                                        <span style={{ fontSize: 12, color: 'var(--muted-foreground)', alignSelf: 'center' }}>
                                            This order is {STATUS_LABELS[viewOrder.status]?.toLowerCase()} — no further changes allowed.
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
