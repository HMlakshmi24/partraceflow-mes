'use client';

import { useEffect, useState, useTransition } from 'react';
import { createManufacturingOrder } from '@/lib/actions/erp';
import { ShoppingCart, Search, Eye, Printer, X, CheckCircle, Clock, AlertCircle, Ban, Plus, Package } from 'lucide-react';
import styles from './planner.module.css';

const STATUS_COLORS: Record<string, string> = {
    RELEASED:    '#3b82f6',
    IN_PROGRESS: '#f59e0b',
    COMPLETED:   '#10b981',
    CANCELLED:   '#ef4444',
    ON_HOLD:     '#8b5cf6',
    PLANNED:     'var(--muted-foreground)',
};

const STATUS_LABELS: Record<string, string> = {
    RELEASED:    'Released',
    IN_PROGRESS: 'In Progress',
    COMPLETED:   'Completed',
    CANCELLED:   'Cancelled',
    ON_HOLD:     'On Hold',
    PLANNED:     'Planned',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
    RELEASED:    <Clock size={13} />,
    IN_PROGRESS: <AlertCircle size={13} />,
    COMPLETED:   <CheckCircle size={13} />,
    CANCELLED:   <Ban size={13} />,
    ON_HOLD:     <AlertCircle size={13} />,
    PLANNED:     <Clock size={13} />,
};

// Status filter tabs
const STATUS_TABS = [
    { key: 'All Status', label: 'All' },
    { key: 'RELEASED',   label: 'Released' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'COMPLETED',  label: 'Completed' },
    { key: 'ON_HOLD',    label: 'On Hold' },
    { key: 'CANCELLED',  label: 'Cancelled' },
];

// ── Status Badge ──────────────────────────────────────────────────────────────

function OrderStatusBadge({ status }: { status: string }) {
    const color = STATUS_COLORS[status] ?? 'var(--muted-foreground)';
    const label = STATUS_LABELS[status] ?? status.replace('_', ' ');
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: typeof color === 'string' && !color.startsWith('var') ? color + '18' : 'var(--surface-muted)',
            color,
            fontSize: 12, fontWeight: 800,
            border: `1px solid ${typeof color === 'string' && !color.startsWith('var') ? color + '40' : 'var(--card-border)'}`,
            whiteSpace: 'nowrap' as const,
        }}>
            {STATUS_ICONS[status]}
            {label}
        </span>
    );
}

// ── Summary Stat Card ─────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: {
    label: string; value: number; color: string; icon: any;
}) {
    return (
        <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderLeft: `4px solid ${color}`,
            borderRadius: 12, padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: 'var(--shadow-soft)',
        }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} color={color} />
            </div>
            <div>
                <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            </div>
        </div>
    );
}

export default function PlannerPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 8;

    // View Order Modal
    const [viewOrder, setViewOrder] = useState<any>(null);

    // Action feedback
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [isPending, startTransition] = useTransition();

    const loadData = async () => {
        try {
            const res = await fetch('/api/orders').catch(() => null);
            if (res?.ok) {
                const data = await res.json();
                setProducts(data.products || []);
                setOrders(data.orders || []);
                setFiltered(data.orders || []);
            } else {
                setProducts([
                    { id: '1', sku: 'PART-101', name: 'Titanium Bracket' },
                    { id: '2', sku: 'PART-202', name: 'Steel Connector' }
                ]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    // Apply search + status filter
    const applyFilter = () => {
        let result = [...orders];
        const q = searchText.trim().toLowerCase();
        if (q) {
            result = result.filter(o =>
                o.orderNumber?.toLowerCase().includes(q) ||
                o.product?.name?.toLowerCase().includes(q) ||
                o.product?.sku?.toLowerCase().includes(q)
            );
        }
        if (statusFilter !== 'All Status') {
            result = result.filter(o => o.status === statusFilter);
        }
        setFiltered(result);
        setPage(1);
    };

    useEffect(() => { applyFilter(); }, [searchText, statusFilter, orders]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleView = async (id: string) => {
        setViewOrder({ loading: true });
        try {
            const res = await fetch(`/api/orders/${id}`);
            const data = await res.json();
            setViewOrder(data);
        } catch {
            setViewOrder(null);
        }
    };

    const handlePrint = (order: any) => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`
            <html><head><title>Work Order ${order.orderNumber}</title>
            <style>body{font-family:monospace;padding:20px} h1{font-size:18px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #999;padding:8px} @media print{button{display:none}}</style>
            </head><body>
            <h1>WORK ORDER: ${order.orderNumber}</h1>
            <table>
              <tr><th>Field</th><th>Value</th></tr>
              <tr><td>Product</td><td>${order.product?.name} (${order.product?.sku})</td></tr>
              <tr><td>Quantity</td><td>${order.quantity}</td></tr>
              <tr><td>Status</td><td>${order.status}</td></tr>
              <tr><td>Due Date</td><td>${new Date(order.dueDate).toLocaleDateString()}</td></tr>
              <tr><td>Created</td><td>${new Date(order.createdAt).toLocaleString()}</td></tr>
            </table>
            <br/><p>Printed: ${new Date().toLocaleString()}</p>
            <button onclick="window.print()">Print</button>
            </body></html>
        `);
        w.document.close();
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/orders/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                setMsg({ text: `Order updated to "${STATUS_LABELS[newStatus] ?? newStatus}"`, type: 'success' });
                await loadData();
                setViewOrder(null);
            } else {
                setMsg({ text: 'Failed to update status', type: 'error' });
            }
        } catch {
            setMsg({ text: 'Network error — please try again', type: 'error' });
        }
        setTimeout(() => setMsg(null), 3000);
    };

    return (
        <div className={styles.productionPlanner}>

            {/* ── Toast ─────────────────────────────────────────────────────────── */}
            {msg && (
                <div style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000,
                    padding: '0.9rem 1.5rem', borderRadius: '0.75rem', fontWeight: 700,
                    fontSize: '0.95rem',
                    background: msg.type === 'success' ? '#10b981' : '#ef4444', color: '#fff',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    {msg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {msg.text}
                </div>
            )}

            {/* ── Page Header ───────────────────────────────────────────────────── */}
            <div style={{
                background: 'linear-gradient(135deg, #0b1220 0%, #1e3a5f 60%, #1e86ff 100%)',
                borderRadius: '1.25rem', padding: '1.75rem 2rem', marginBottom: '1.75rem',
                boxShadow: '0 8px 30px rgba(14,60,120,0.3)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ShoppingCart size={22} color="#fff" />
                            </div>
                            <h1 style={{ margin: 0, color: '#fff', fontSize: '1.7rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                                Work Orders
                                {orders.length > 0 && (
                                    <span style={{ marginLeft: 12, fontSize: '1rem', fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.2)', verticalAlign: 'middle' }}>
                                        {orders.length}
                                    </span>
                                )}
                            </h1>
                        </div>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem' }}>
                            Release and track production orders on the shop floor
                        </p>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '1rem', fontWeight: 600 }}>
                    Loading work orders…
                </div>
            ) : (
                <>
                    {/* ── Summary KPI Cards ──────────────────────────────────────── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
                        <StatCard label="Released" value={orders.filter(o => o.status === 'RELEASED').length} color="#3b82f6" icon={Clock} />
                        <StatCard label="In Progress" value={orders.filter(o => o.status === 'IN_PROGRESS').length} color="#f59e0b" icon={AlertCircle} />
                        <StatCard label="Completed" value={orders.filter(o => o.status === 'COMPLETED').length} color="#10b981" icon={CheckCircle} />
                        <StatCard label="On Hold" value={orders.filter(o => o.status === 'ON_HOLD').length} color="#8b5cf6" icon={Ban} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.75rem' }}>

                        {/* ── CREATE ORDER FORM ──────────────────────────────────── */}
                        <section className={styles.formSection}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(30,134,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Plus size={18} color="#1e86ff" />
                                </div>
                                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Release New Work Order</h2>
                            </div>

                            <form action={async (fd) => {
                                startTransition(async () => {
                                    try {
                                        await createManufacturingOrder(fd);
                                        setMsg({ text: 'Order released to shop floor!', type: 'success' });
                                        await loadData();
                                    } catch (e: any) {
                                        setMsg({ text: e.message || 'Failed to create order', type: 'error' });
                                    }
                                    setTimeout(() => setMsg(null), 3000);
                                });
                            }}>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Order Number</label>
                                        <input
                                            name="orderNumber"
                                            defaultValue={`WO-${Date.now().toString().slice(-6)}`}
                                            required
                                            className={styles.formInput}
                                            style={{ minHeight: 44 }}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Product</label>
                                        <select
                                            name="productId"
                                            required
                                            className={styles.formSelect}
                                            style={{ minHeight: 44 }}
                                        >
                                            {products.map((p: any) => (
                                                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Quantity</label>
                                        <input
                                            name="quantity"
                                            type="number"
                                            defaultValue="100"
                                            required
                                            className={styles.formInput}
                                            style={{ minHeight: 44 }}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Priority</label>
                                        <select
                                            name="priority"
                                            className={styles.formSelect}
                                            style={{ minHeight: 44 }}
                                        >
                                            <option value="1">1 — Low Priority</option>
                                            <option value="2">2 — Normal</option>
                                            <option value="3">3 — High Priority</option>
                                            <option value="4">4 — URGENT</option>
                                        </select>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={isPending}
                                    style={{ width: '100%', minHeight: 52, fontSize: '1.05rem' }}
                                >
                                    {isPending ? 'Releasing to Shop Floor…' : 'Release to Shop Floor'}
                                </button>
                            </form>
                        </section>

                        {/* ── ORDER LIST SECTION ─────────────────────────────────── */}
                        <section className={styles.tableSection}>
                            {/* Header row */}
                            <div className={styles.tableTitleRow}>
                                <div>
                                    <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                                        Work Order History
                                    </h2>
                                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
                                        {filtered.length} order{filtered.length !== 1 ? 's' : ''} shown
                                    </p>
                                </div>
                                {/* Search */}
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                                    <input
                                        placeholder="Search orders…"
                                        value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                        className={styles.filterSelect}
                                        style={{ width: '200px', paddingLeft: '2.1rem', minHeight: 44, fontSize: 14 }}
                                    />
                                </div>
                            </div>

                            {/* Status filter tabs */}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                                {STATUS_TABS.map(tab => {
                                    const active = statusFilter === tab.key;
                                    const color = tab.key !== 'All Status' ? (STATUS_COLORS[tab.key] ?? '#64748b') : '#3b82f6';
                                    const count = tab.key === 'All Status' ? orders.length : orders.filter(o => o.status === tab.key).length;
                                    return (
                                        <button
                                            key={tab.key}
                                            onClick={() => setStatusFilter(tab.key)}
                                            style={{
                                                minHeight: 38, padding: '0 14px',
                                                borderRadius: 999,
                                                border: active ? `2px solid ${color}` : '1.5px solid var(--card-border)',
                                                background: active ? color + '18' : 'var(--card-bg)',
                                                color: active ? color : 'var(--muted-foreground)',
                                                fontWeight: active ? 800 : 600, fontSize: 13,
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                            }}
                                        >
                                            {tab.label}
                                            <span style={{
                                                fontSize: 11, fontWeight: 800,
                                                padding: '1px 6px', borderRadius: 999,
                                                background: active ? color + '28' : 'var(--surface-muted)',
                                                color: active ? color : 'var(--muted-foreground)',
                                            }}>
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
                                            <th>Due Date</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className={styles.tableBody}>
                                        {pageOrders.length === 0 ? (
                                            <tr>
                                                <td colSpan={6}>
                                                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted-foreground)' }}>
                                                        <Package size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
                                                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                                                            {orders.length === 0 ? 'No work orders yet.' : 'No orders match your filter.'}
                                                        </p>
                                                        <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                                                            {orders.length === 0 ? 'Use the form on the left to release your first order.' : 'Try a different status or clear your search.'}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            pageOrders.map((order: any) => (
                                                <tr key={order.id}>
                                                    <td>
                                                        <span className={styles.orderNumber} style={{ fontSize: 14 }}>
                                                            {order.orderNumber}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{order.product?.name || 'Unknown'}</div>
                                                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>{order.product?.sku}</div>
                                                    </td>
                                                    <td style={{ fontSize: 15, fontWeight: 700 }}>{order.quantity}</td>
                                                    <td>
                                                        <OrderStatusBadge status={order.status} />
                                                    </td>
                                                    <td style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                                                        {new Date(order.dueDate).toLocaleDateString()}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <div className={styles.tableActions}>
                                                            <button
                                                                className={styles.actionIcon}
                                                                title="View Details"
                                                                onClick={() => handleView(order.id)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--foreground)' }}
                                                            >
                                                                <Eye size={13} /> View
                                                            </button>
                                                            <button
                                                                className={styles.actionIcon}
                                                                title="Print"
                                                                onClick={() => handlePrint(order)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--foreground)' }}
                                                            >
                                                                <Printer size={13} /> Print
                                                            </button>
                                                            {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                                                                <button
                                                                    className={styles.actionIcon}
                                                                    title="Cancel"
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                                                                    onClick={() => {
                                                                        if (confirm(`Cancel order ${order.orderNumber}?`)) {
                                                                            handleStatusChange(order.id, 'CANCELLED');
                                                                        }
                                                                    }}
                                                                >
                                                                    <X size={13} /> Cancel
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className={styles.pagination}>
                                <button
                                    className={styles.pageButton}
                                    disabled={page <= 1}
                                    onClick={() => setPage(p => p - 1)}
                                    style={{ minHeight: 40 }}
                                >
                                    &lt; Previous
                                </button>
                                <span className={styles.pageInfo}>
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    className={styles.pageButton}
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                    style={{ minHeight: 40 }}
                                >
                                    Next &gt;
                                </button>
                            </div>
                        </section>
                    </div>
                </>
            )}

            {/* ── VIEW ORDER MODAL ───────────────────────────────────────────────── */}
            {viewOrder && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setViewOrder(null); }}
                >
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1.1rem', padding: '2rem',
                        width: '100%', maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                                    Work Order Details
                                </h2>
                                {!viewOrder.loading && (
                                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
                                        {viewOrder.orderNumber}
                                    </p>
                                )}
                            </div>
                            <button onClick={() => setViewOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, display: 'flex' }}>
                                <X size={24} />
                            </button>
                        </div>

                        {viewOrder.loading ? (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                                Loading order details…
                            </div>
                        ) : (
                            <>
                                {/* Order status badge */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <OrderStatusBadge status={viewOrder.status} />
                                </div>

                                {/* Details grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1.5rem' }}>
                                    {[
                                        ['Order Number', viewOrder.orderNumber],
                                        ['Product', `${viewOrder.product?.name} (${viewOrder.product?.sku})`],
                                        ['Quantity to Make', viewOrder.quantity],
                                        ['Current Status', STATUS_LABELS[viewOrder.status] ?? viewOrder.status],
                                        ['Due Date', new Date(viewOrder.dueDate).toLocaleDateString()],
                                        ['Created', new Date(viewOrder.createdAt).toLocaleString()],
                                    ].map(([label, value]) => (
                                        <div key={String(label)} style={{ background: 'var(--surface-muted)', borderRadius: '0.6rem', padding: '0.85rem 1rem' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginBottom: '0.3rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
                                                {label}
                                            </div>
                                            <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '0.95rem' }}>{String(value)}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Workflow Tasks */}
                                {viewOrder.workflowInstances?.[0]?.tasks?.length > 0 && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--foreground)' }}>
                                            Workflow Steps
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {viewOrder.workflowInstances[0].tasks.map((t: any, i: number) => (
                                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.85rem', background: 'var(--surface-muted)', borderRadius: '0.6rem' }}>
                                                    <div style={{
                                                        width: '28px', height: '28px', borderRadius: '50%',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: t.status === 'COMPLETED' ? '#10b981' : t.status === 'IN_PROGRESS' ? '#f59e0b' : 'var(--card-border)',
                                                        color: t.status === 'COMPLETED' || t.status === 'IN_PROGRESS' ? '#fff' : 'var(--muted-foreground)',
                                                        fontSize: '0.78rem', fontWeight: 800,
                                                    }}>
                                                        {i + 1}
                                                    </div>
                                                    <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>
                                                        {t.stepDef?.name || `Step ${i + 1}`}
                                                    </div>
                                                    <OrderStatusBadge status={t.status} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => handlePrint(viewOrder)}
                                        style={{ minHeight: 44, padding: '0 18px', borderRadius: '0.65rem', border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: 'var(--foreground)', fontSize: 14 }}
                                    >
                                        <Printer size={16} /> Print
                                    </button>

                                    {viewOrder.status !== 'COMPLETED' && viewOrder.status !== 'CANCELLED' && (
                                        <button
                                            onClick={() => { if (confirm(`Cancel order ${viewOrder.orderNumber}?`)) handleStatusChange(viewOrder.id, 'CANCELLED'); }}
                                            style={{ minHeight: 44, padding: '0 18px', borderRadius: '0.65rem', border: 'none', background: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#fff', fontSize: 14 }}
                                        >
                                            <X size={16} /> Cancel Order
                                        </button>
                                    )}

                                    {viewOrder.status === 'RELEASED' && (
                                        <button
                                            onClick={() => handleStatusChange(viewOrder.id, 'IN_PROGRESS')}
                                            style={{ minHeight: 44, padding: '0 18px', borderRadius: '0.65rem', border: 'none', background: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#fff', fontSize: 14 }}
                                        >
                                            <AlertCircle size={16} /> Mark In Progress
                                        </button>
                                    )}

                                    {viewOrder.status === 'IN_PROGRESS' && (
                                        <button
                                            onClick={() => handleStatusChange(viewOrder.id, 'COMPLETED')}
                                            style={{ minHeight: 44, padding: '0 18px', borderRadius: '0.65rem', border: 'none', background: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#fff', fontSize: 14 }}
                                        >
                                            <CheckCircle size={16} /> Mark Completed
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
