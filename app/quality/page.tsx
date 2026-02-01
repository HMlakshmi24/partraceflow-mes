'use client';

import { CheckCircle, XCircle, Camera, Save, Clipboard, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import styles from './quality.module.css';

export default function QualityGatePage() {
    const [order, setOrder] = useState('WO-2024-8821');
    const [product, setProduct] = useState('Widget-X (Rev 2)');
    const [status, setStatus] = useState<'PENDING' | 'PASS' | 'FAIL' | 'REWORK'>('PENDING');

    return (
        <div className={styles.qualityControl}>

            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <h1>
                        <CheckCircle size={32} style={{ display: 'inline', marginRight: '10px' }} /> Quality Gate: Final Inspection
                    </h1>
                    <div className={styles.orderInfo}>
                        <span>Station QG-04</span>
                        <span className={styles.divider}>|</span>
                        <span>User: Inspector_01</span>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.2rem' }}>Current Work Order</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'monospace' }}>{order}</div>
                </div>
            </div>

            <div className={styles.content}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>

                    {/* LEFT: INSPECTION FORM */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        {/* VISUAL CHECK */}
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}><Clipboard size={20} /> 1. Visual Inspection</h3>
                            <div className={styles.checklist}>
                                <label className={styles.checklistItem}>
                                    <input type="checkbox" className={styles.hiddenCheckbox} />
                                    <div className={styles.checkbox}>✓</div>
                                    <span>Surface Finish (No scratches greater than 1mm)</span>
                                </label>
                                <label className={styles.checklistItem}>
                                    <input type="checkbox" className={styles.hiddenCheckbox} />
                                    <div className={styles.checkbox}>✓</div>
                                    <span>Color Match (Pantone 305C)</span>
                                </label>
                                <label className={styles.checklistItem}>
                                    <input type="checkbox" className={styles.hiddenCheckbox} />
                                    <div className={styles.checkbox}>✓</div>
                                    <span>Label Alignment & Clarity</span>
                                </label>
                            </div>
                        </div>

                        {/* MEASUREMENTS */}
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}><TrendingUp size={20} /> 2. Key Measurements</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: '#b0b8c1' }}>Diameter (mm)</label>
                                    <input type="number" placeholder="Spec: 25.0 ± 0.1" className={styles.input} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: '#b0b8c1' }}>Weight (g)</label>
                                    <input type="number" placeholder="Spec: 140 ± 5" className={styles.input} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', color: '#b0b8c1' }}>Torque Test (Nm)</label>
                                    <input type="number" placeholder="Min: 12.5" className={styles.input} />
                                </div>
                            </div>
                        </div>

                        {/* PHOTO EVIDENCE */}
                        <div className={styles.section}>
                            <h3 className={styles.sectionTitle}><Camera size={20} /> 3. Evidence Capture</h3>
                            <div style={{ border: '2px dashed #3a4f5f', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center', color: '#7a8a99', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <Camera size={48} style={{ margin: '0 auto', marginBottom: '1rem', opacity: 0.5 }} />
                                <p>Click or Drag photos here to attach evidence</p>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT: DECISION PANEL */}
                    <div style={{ position: 'sticky', top: '2rem', height: 'fit-content' }}>
                        <div className={styles.section} style={{ borderColor: '#00d4ff' }}>
                            <h3 className={styles.sectionTitle} style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#7a8a99' }}>Final Decision</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                <button
                                    onClick={() => setStatus('PASS')}
                                    className={styles.submitButton}
                                    style={{
                                        position: 'relative', height: '80px', fontSize: '1.2rem',
                                        backgroundColor: status === 'PASS' ? '#00ff88' : undefined,
                                        color: status === 'PASS' ? '#0f1419' : undefined,
                                        border: status === 'PASS' ? 'none' : '2px solid #3a4f5f',
                                        background: status === 'PASS' ? undefined : 'transparent'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <CheckCircle size={28} /> PASS
                                    </div>
                                    {status === 'PASS' && <div className={styles.statusDot} style={{ position: 'absolute', top: 10, right: 10, background: '#0f1419', width: 8, height: 8, borderRadius: '50%' }}></div>}
                                </button>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <button
                                        onClick={() => setStatus('REWORK')}
                                        className={styles.resetButton}
                                        style={{
                                            border: status === 'REWORK' ? '2px solid #ffd700' : undefined,
                                            color: status === 'REWORK' ? '#ffd700' : undefined
                                        }}
                                    >
                                        <Clipboard size={18} /> REWORK
                                    </button>

                                    <button
                                        onClick={() => setStatus('FAIL')}
                                        className={styles.resetButton}
                                        style={{
                                            border: status === 'FAIL' ? '2px solid #ff3333' : undefined,
                                            color: status === 'FAIL' ? '#ff3333' : undefined
                                        }}
                                    >
                                        <XCircle size={18} /> SCRAP
                                    </button>
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #3a4f5f', paddingTop: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#7a8a99', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Inspector Notes</label>
                                <textarea className={styles.textarea} placeholder="Add context for Rework/Scrap..." rows={3}></textarea>

                                <button
                                    className={styles.submitButton}
                                    style={{ width: '100%', marginTop: '1rem' }}
                                    disabled={status === 'PENDING'}
                                >
                                    <Save size={18} /> {status === 'PENDING' ? 'Select Outcome' : 'Submit Inspection'}
                                </button>
                            </div>

                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
