'use client';

import { Search, FileText, Package, Clock, User, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import styles from './traceability.module.css';

export default function TraceabilityPage() {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState<any>(null);

    const handleSearch = () => {
        // Mock Search Result
        setResult({
            serial: query || 'SN-99281-AA',
            product: 'Widget-X Premium',
            mfgDate: '2026-01-22 14:30',
            status: 'SHIPPED',
            events: [
                { id: 1, type: 'CREATE', user: 'Planner_01', time: '08:00', details: 'Order Created WO-2024-8821' },
                { id: 2, type: 'START', user: 'Operator_Dave', time: '09:15', details: 'Machining Started at W21' },
                { id: 3, type: 'QUALITY', user: 'Inspector_01', time: '11:45', details: 'Passed Visual Check' },
                { id: 4, type: 'FINISH', user: 'Operator_Dave', time: '13:00', details: 'Assembly Complete' },
                { id: 5, type: 'SHIP', user: 'System', time: '16:00', details: 'Manifest Generated' },
            ],
            components: [
                { name: 'Motor Assembly', serial: 'M-552' },
                { name: 'Housing Unit', serial: 'H-102' },
                { name: 'PCB Control Board', serial: 'P-991' },
            ]
        });
    };

    return (
        <div className={styles.traceabilityContainer}>
            <header className={styles.header}>
                <h1 className={styles.headerTitle}>
                    <FileText /> End-to-End Traceability
                </h1>
            </header>

            {/* SEARCH BAR */}
            <div className={styles.searchCard}>
                <div className={styles.searchContainer}>
                    <div className={styles.searchInputWrapper}>
                        <Search className={styles.searchIcon} size={20} />
                        <input
                            type="text"
                            placeholder="Scan Serial Number, Batch ID, or Order # (e.g. SN-99281)"
                            className={styles.searchInput}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <button onClick={handleSearch} className={styles.searchButton}>Trace</button>
                </div>
            </div>

            {result && (
                <div className={styles.gridContainer}>

                    {/* LEFT: GENEALOGY TREE */}
                    <div className="col-span-1">
                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}><Package size={18} /> Product Genealogy</h3>

                            <div className={styles.genealogyTree}>
                                {/* PARENT */}
                                <div className={styles.genealogyNode}>
                                    <div className={`${styles.nodeMarker} ${styles.parent}`}></div>
                                    <div className={styles.nodeName}>{result.product}</div>
                                    <div className={styles.nodeSerial}>{result.serial}</div>
                                    <div className={styles.nodeStatus}>{result.status}</div>
                                </div>

                                {/* CHILDREN */}
                                <div className="space-y-4">
                                    {result.components.map((c: any, i: number) => (
                                        <div key={i} className={styles.genealogyNode} style={{ marginBottom: '1rem' }}>
                                            <div className={`${styles.nodeMarker} ${styles.child}`}></div>
                                            <div className="font-bold text-sm text-white">{c.name}</div>
                                            <div className="text-xs text-gray-400 font-mono">{c.serial}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* RIGHT: AUDIT LOG TIMELINE */}
                    <div className="col-span-2">
                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}>
                                <Clock size={18} /> Complete Event History
                                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#7a8fa1', fontWeight: 'normal' }}>Immutable Ledger</span>
                            </h3>

                            <div className="space-y-0">
                                {result.events.map((evt: any, i: number) => (
                                    <div key={i} className={styles.timelineItem}>
                                        <div className={styles.timelineTime}>{evt.time}</div>
                                        <div className={styles.timelineContentWrapper}>
                                            <div className={styles.timelineMarker} style={{ background: evt.type === 'QUALITY' ? '#ffd700' : evt.type === 'SHIP' ? '#00ff88' : '#00d4ff' }}></div>
                                            <div className={styles.timelineCard}>
                                                <div className={styles.timelineHeader}>
                                                    <span className={styles.timelineType} style={{ color: evt.type === 'QUALITY' ? '#ffd700' : evt.type === 'SHIP' ? '#00ff88' : '#00d4ff' }}>{evt.type}</span>
                                                    <span className={styles.timelineUser}><User size={12} /> {evt.user}</span>
                                                </div>
                                                <div className={styles.timelineDetails}>{evt.details}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
