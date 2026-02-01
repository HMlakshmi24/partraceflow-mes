'use client';

import { useEffect, useState } from 'react';
import { createManufacturingOrder } from '@/lib/actions/erp';
import { ShoppingCart } from 'lucide-react';
import styles from './planner.module.css';

export default function PlannerPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch products
                const response = await fetch('/api/orders', {
                    method: 'GET',
                }).catch(() => null);

                if (response && response.ok && typeof response.json === 'function') {
                    const data = await response.json();
                    setProducts(data.products || []);
                    setOrders(data.orders || []);
                } else {
                    // Mock data if API fails
                    setProducts([
                        { id: '1', sku: 'PART-101', name: 'Titanium Bracket', description: 'Aerospace grade' },
                        { id: '2', sku: 'PART-202', name: 'Steel Connector', description: 'Industrial' }
                    ]);
                    setOrders([]);
                }
            } catch (error) {
                console.log('Using default products');
                setProducts([
                    { id: '1', sku: 'PART-101', name: 'Titanium Bracket', description: 'Aerospace grade' },
                    { id: '2', sku: 'PART-202', name: 'Steel Connector', description: 'Industrial' }
                ]);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    return (
        <div className={styles.productionPlanner}>
            <header className={styles.header}>
                <h1 className={styles.headerTitle}>
                    <ShoppingCart className={styles.headerIcon} /> ERP Production Planner
                </h1>
                <p className={styles.headerActions}>Simulate SAP/Netsuite Order Release</p>
            </header>

            {isLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

                {/* CREATE ORDER FORM */}
                <section className={styles.formSection}>
                    <h2 className={styles.sectionTitle}>Release New Work Order</h2>
                    <form action={createManufacturingOrder}>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Order Number</label>
                                <input name="orderNumber" defaultValue={`WO-${Date.now().toString().slice(-4)}`} required className={styles.formInput} />
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
                        </div>

                        <button type="submit" className={styles.submitButton}>
                            🚀 Release to Shop Floor
                        </button>
                    </form>
                </section>

                {/* ORDER HISTORY TABLE */}
                <section className={styles.tableSection}>
                    <div className={styles.tableTitleRow}>
                        <h2 className={styles.sectionTitle}>Production History</h2>
                        <div className={styles.tableControls}>
                            <input placeholder="Search orders..." className={styles.filterSelect} style={{ width: '200px' }} />
                            <select className={styles.filterSelect}>
                                <option>All Status</option>
                                <option>Released</option>
                                <option>In Progress</option>
                                <option>Completed</option>
                            </select>
                            <button className={styles.headerButton} style={{ padding: '0.6rem 1rem', fontSize: '0.9rem' }}>
                                🔍 Filter
                            </button>
                        </div>
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.ordersTable}>
                            <thead className={styles.tableHeader}>
                                <tr>
                                    <th>Order #</th>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>Status</th>
                                    <th>Due Date</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className={styles.tableBody}>
                                {orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#7a8fa1' }}>
                                            No orders found. Create one to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map((order: any) => (
                                        <tr key={order.id}>
                                            <td><span className={styles.orderNumber}>{order.orderNumber}</span></td>
                                            <td>
                                                <div style={{ fontWeight: '600' }}>{order.product?.name || 'Unknown'}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#7a8fa1' }}>{order.product?.sku}</div>
                                            </td>
                                            <td>{order.quantity}</td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${order.status === 'COMPLETED' ? styles.completed : order.status === 'RELEASED' ? styles.active : styles.qc}`}>
                                                    <span className={styles.statusDot}></span> {order.status}
                                                </span>
                                            </td>
                                            <td>{new Date(order.dueDate).toLocaleDateString()}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className={styles.tableActions}>
                                                    <button className={styles.actionIcon} title="View Details">👁️</button>
                                                    <button className={styles.actionIcon} title="Print Label">🖨️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.pagination}>
                        <button className={styles.pageButton} disabled>&lt; Prev</button>
                        <span className={styles.pageInfo}>Page 1 of 1</span>
                        <button className={styles.pageButton} disabled>Next &gt;</button>
                    </div>
                </section>

            </div>
            )}
        </div>
    );
}
