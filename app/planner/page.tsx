'use client';

import { useEffect, useState, useTransition } from 'react';
import { createManufacturingOrder } from '@/lib/actions/erp';
import { ShoppingCart, Search, Eye, Printer, X, CheckCircle, Clock, AlertCircle, Ban } from 'lucide-react';
import styles from './planner.module.css';

const STATUS_COLORS: Record<string, string> = {
    RELEASED:    '#3b82f6',
    IN_PROGRESS: '#f59e0b',
    COMPLETED:   '#10b981',
    CANCELLED:   '#ef4444',
    ON_HOLD:     '#8b5cf6',
    PLANNED:     'var(--muted-foreground)',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
    RELEASED:    <Clock size={12} />,
    IN_PROGRESS: <AlertCircle size={12} />,
    COMPLETED:   <CheckCircle size={12} />,
    CANCELLED:   <Ban size={12} />,
    ON_HOLD:     <AlertCircle size={12} />,
    PLANNED:     <Clock size={12} />,
};

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

    // Live search on keystroke
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
                setMsg({ text: `Order status updated to ${newStatus}`, type: 'success' });
                await loadData();
                setViewOrder(null);
            } else {
                setMsg({ text: 'Failed to update status', type: 'error' });
            }
        } catch {
            setMsg({ text: 'Network error', type: 'error' });
        }
        setTimeout(() => setMsg(null), 3000);
    };

    return (
        <div className={styles.productionPlanner}>
            <header className={styles.header}>
                <h1 className={styles.headerTitle}>
                    <ShoppingCart className={styles.headerIcon} /> ERP Production Planner
                </h1>
                <p className={styles.headerActions}>Release orders to the shop floor with live workflow orchestration</p>
            </header>

            {/* Toast Notification */}
            {msg && (
                <div style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000,
                    padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600,
                    background: msg.type === 'success' ? '#10b981' : '#ef4444', color: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                    {msg.text}
                </div>
            )}

            {isLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '2rem' }}>

                    {/* CREATE ORDER FORM */}
                    <section className={styles.formSection}>
                        <h2 className={styles.sectionTitle}>Release New Work Order</h2>
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
                                    <input name="orderNumber" defaultValue={`WO-${Date.now().toString().slice(-6)}`} required className={styles.formInput} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Product</label>
                                    <select name="productId" required className={styles.formSelect}>
                                        {products.map((p: any) => (
                                            <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Quantity</label>
                                    <input name="quantity" type="number" defaultValue="100" required className={styles.formInput} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Priority</label>
                                    <select name="priority" className={styles.formSelect}>
                                        <option value="1">1 - Low</option>
                                        <option value="2">2 - Normal</option>
                                        <option value="3">3 - High</option>
                                        <option value="4">4 - Urgent</option>
                                    </select>
                                </div>
                            </div>
                            <button type="submit" className={styles.submitButton} disabled={isPending}>
                                {isPending ? 'Releasing...' : ' Release to Shop Floor'}
                            </button>
                        </form>

                        {/* Summary Cards */}
                        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                            {['RELEASED', 'IN_PROGRESS', 'COMPLETED'].map(s => (
                                <div key={s} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '0.75rem', padding: '1rem', textAlign: 'center', border: `2px solid ${STATUS_COLORS[s]}30` }}>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: STATUS_COLORS[s] }}>
                                        {orders.filter(o => o.status === s).length}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', marginTop: '0.25rem' }}>{s.replace('_', ' ')}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ORDER HISTORY TABLE */}
                    <section className={styles.tableSection}>
                        <div className={styles.tableTitleRow}>
                            <h2 className={styles.sectionTitle}>Production History ({filtered.length})</h2>
                            <div className={styles.tableControls}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input
                                        placeholder="Search orders..."
                                        value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                        className={styles.filterSelect}
                                        style={{ width: '180px', paddingLeft: '2rem' }}
                                    />
                                </div>
                                <select
                                    value={statusFilter}
                                    onChange={e => setStatusFilter(e.target.value)}
                                    className={styles.filterSelect}
                                >
                                    <option>All Status</option>
                                    <option>RELEASED</option>
                                    <option>IN_PROGRESS</option>
                                    <option>COMPLETED</option>
                                    <option>CANCELLED</option>
                                    <option>ON_HOLD</option>
                                </select>
                            </div>
                        </div>

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
                                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#7a8fa1' }}>
                                                {orders.length === 0 ? 'No orders yet. Release one above.' : 'No orders match your filter.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        pageOrders.map((order: any) => (
                                            <tr key={order.id}>
                                                <td><span className={styles.orderNumber}>{order.orderNumber}</span></td>
                                                <td>
                                                    <div style={{ fontWeight: '600' }}>{order.product?.name || 'Unknown'}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#7a8fa1' }}>{order.product?.sku}</div>
                                                </td>
                                                <td>{order.quantity}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '3px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700,
                                                        background: STATUS_COLORS[order.status] + '20',
                                                        color: STATUS_COLORS[order.status]
                                                    }}>
                                                        {STATUS_ICONS[order.status]} {order.status}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.85rem' }}>{new Date(order.dueDate).toLocaleDateString()}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div className={styles.tableActions}>
                                                        <button
                                                            className={styles.actionIcon}
                                                            title="View Details"
                                                            onClick={() => handleView(order.id)}
                                                        >
                                                            <Eye size={14} /> View
                                                        </button>
                                                        <button
                                                            className={styles.actionIcon}
                                                            title="Print Label"
                                                            onClick={() => handlePrint(order)}
                                                        >
                                                            <Printer size={14} /> Print
                                                        </button>
                                                        {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                                                            <button
                                                                className={styles.actionIcon}
                                                                title="Cancel Order"
                                                                style={{ color: '#ef4444' }}
                                                                onClick={() => {
                                                                    if (confirm(`Cancel order ${order.orderNumber}?`)) {
                                                                        handleStatusChange(order.id, 'CANCELLED');
                                                                    }
                                                                }}
                                                            >
                                                                <X size={14} /> Cancel
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
                            >
                                &lt; Prev
                            </button>
                            <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
                            <button
                                className={styles.pageButton}
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next &gt;
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {/* VIEW ORDER MODAL */}
            {viewOrder && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }} onClick={e => { if (e.target === e.currentTarget) setViewOrder(null); }}>
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem',
                        width: '100%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                                Order Details
                            </h2>
                            <button onClick={() => setViewOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                                <X size={24} />
                            </button>
                        </div>

                        {viewOrder.loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>Loading...</div>
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                    {[
                                        ['Order Number', viewOrder.orderNumber],
                                        ['Product', `${viewOrder.product?.name} (${viewOrder.product?.sku})`],
                                        ['Quantity', viewOrder.quantity],
                                        ['Status', viewOrder.status],
                                        ['Due Date', new Date(viewOrder.dueDate).toLocaleDateString()],
                                        ['Created', new Date(viewOrder.createdAt).toLocaleString()],
                                    ].map(([label, value]) => (
                                        <div key={String(label)} style={{ background: 'var(--surface-muted)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
                                            <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{String(value)}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Workflow Tasks */}
                                {viewOrder.workflowInstances?.[0]?.tasks?.length > 0 && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--foreground)' }}>Workflow Progress</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {viewOrder.workflowInstances[0].tasks.map((t: any, i: number) => (
                                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--surface-muted)', borderRadius: '0.5rem' }}>
                                                    <div style={{
                                                        width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: t.status === 'COMPLETED' ? '#10b981' : t.status === 'IN_PROGRESS' ? '#f59e0b' : 'var(--card-border)',
                                                        color: t.status === 'COMPLETED' || t.status === 'IN_PROGRESS' ? 'var(--card-bg)' : 'var(--muted-foreground)',
                                                        fontSize: '0.7rem', fontWeight: 700
                                                    }}>
                                                        {i + 1}
                                                    </div>
                                                    <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{t.stepDef?.name || `Step ${i + 1}`}</div>
                                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', background: STATUS_COLORS[t.status] + '20', color: STATUS_COLORS[t.status] || 'var(--muted-foreground)' }}>
                                                        {t.status}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                                    <button
                                        onClick={() => handlePrint(viewOrder)}
                                        style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--foreground)' }}
                                    >
                                        <Printer size={16} /> Print
                                    </button>
                                    {viewOrder.status !== 'COMPLETED' && viewOrder.status !== 'CANCELLED' && (
                                        <button
                                            onClick={() => {
                                                if (confirm(`Cancel order ${viewOrder.orderNumber}?`)) {
                                                    handleStatusChange(viewOrder.id, 'CANCELLED');
                                                }
                                            }}
                                            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#fff' }}
                                        >
                                            <X size={16} /> Cancel Order
                                        </button>
                                    )}
                                    {viewOrder.status === 'RELEASED' && (
                                        <button
                                            onClick={() => handleStatusChange(viewOrder.id, 'IN_PROGRESS')}
                                            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#fff' }}
                                        >
                                            Mark In Progress
                                        </button>
                                    )}
                                    {viewOrder.status === 'IN_PROGRESS' && (
                                        <button
                                            onClick={() => handleStatusChange(viewOrder.id, 'COMPLETED')}
                                            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#10b981', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#fff' }}
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
