'use client';

import { Activity, Thermometer, Zap, AlertTriangle, Cpu, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import styles from './maintenance.module.css';

export default function PredictiveMaintenancePage() {
    const [selectedMachine, setSelectedMachine] = useState<string | null>(null);

    const machines = [
        { id: 'W21', name: 'Assembly Station A', health: 98, temp: 45, vibration: 0.2, predFail: 'None', status: 'Optimal' },
        { id: 'W22', name: 'Assembly Station B', health: 82, temp: 62, vibration: 0.8, predFail: '30 Days', status: 'Warning' },
        { id: 'CNC-01', name: 'Milling Machine', health: 45, temp: 85, vibration: 2.1, predFail: '48 Hours', status: 'Critical' },
        { id: 'PK-09', name: 'Packaging Unit', health: 91, temp: 38, vibration: 0.1, predFail: 'None', status: 'Optimal' },
    ];

    return (
        <div className={styles.maintenanceContainer}>

            {/* HEADER */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.headerTitle}>
                        <Cpu style={{ marginRight: '10px' }} /> predictive_maintenance_ai.mod
                    </h1>
                    <p style={{ color: '#7a8fa1', marginTop: '0.5rem' }}>ML Model: v2.4 (TensorFlow) | Confidence: 94.2%</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <span style={{ padding: '0.5rem 1rem', background: 'rgba(0, 255, 136, 0.1)', color: '#00ff88', borderRadius: '2rem', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '8px', height: '8px', background: '#00ff88', borderRadius: '50%' }}></div> Live Inference
                    </span>
                </div>
            </div>

            <div className={styles.gridContainer}>

                {/* LEFT: MACHINE GRID */}
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Fleet Health Scores</h2>
                    <div className={styles.machineGrid}>
                        {machines.map(m => (
                            <div key={m.id}
                                onClick={() => setSelectedMachine(m.id)}
                                className={`${styles.machineCard} ${selectedMachine === m.id ? styles.active : ''}`}
                                style={{ borderLeft: `5px solid ${m.health > 90 ? '#4caf50' : m.health > 60 ? '#ff9800' : '#f44336'}` }}
                            >
                                <div className={styles.machineHeader}>
                                    <h3 className={styles.machineName}>{m.name}</h3>
                                    <span className={styles.healthBadge} style={{
                                        backgroundColor: m.health > 90 ? 'rgba(76, 175, 80, 0.1)' : m.health > 60 ? 'rgba(255, 152, 0, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                                        color: m.health > 90 ? '#4caf50' : m.health > 60 ? '#ff9800' : '#f44336'
                                    }}>
                                        {m.health}%
                                    </span>
                                </div>

                                <div className={styles.statsGrid}>
                                    <div className={styles.statRow}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Thermometer size={14} /> Temp</span>
                                        <span className={styles.statValue}>{m.temp}°C</span>
                                    </div>
                                    <div className={styles.statRow}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={14} /> Vib</span>
                                        <span className={styles.statValue}>{m.vibration} G</span>
                                    </div>
                                    <div className={styles.statRow}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={14} /> Power</span>
                                        <span className={styles.statValue}>{(m.health * 0.8).toFixed(1)} A</span>
                                    </div>
                                </div>

                                {m.health < 80 && (
                                    <div className={styles.predictionWarning}>
                                        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                                        <div>
                                            <strong>Failure Predicted:</strong><br />
                                            {m.predFail}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT: DIGITAL TWIN */}
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Digital Twin Visualization</h2>
                    <div className={styles.twinContainer}>

                        {/* TELEMETRY OVERLAY */}
                        <div className={styles.telemetryOverlay}>
                            <div className={styles.telemetryLabel}>REAL-TIME TELEMETRY</div>
                            <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: '#ffffff', marginBottom: '1rem' }}>
                                {selectedMachine ? machines.find(m => m.id === selectedMachine)?.name : 'Select Machine'}
                            </div>
                            <div style={{ display: 'flex', gap: '2rem' }}>
                                <div>
                                    <div className={styles.telemetryLabel}>RPM</div>
                                    <div className={styles.telemetryValue}>3,240</div>
                                </div>
                                <div>
                                    <div className={styles.telemetryLabel}>LOAD</div>
                                    <div className={styles.telemetryValue}>82%</div>
                                </div>
                            </div>
                        </div>

                        {/* MOCK 3D VIEW CENTER */}
                        <div className={styles.twinViewport}>
                            <div className={styles.machineModel}>
                                <Cpu size={80} color="#3a4f5f" />

                                {/* ANOMALY HOTSPOT */}
                                {selectedMachine === 'CNC-01' && (
                                    <div className={styles.anomalyHotspot}>
                                        <div className={styles.anomalyLabel}>
                                            <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} /> VIB_ANOMALY
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* CONNECTING LINES */}
                            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                                <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="#333" strokeDasharray="4 4" />
                                <line x1="50%" y1="50%" x2="80%" y2="20%" stroke="#333" strokeDasharray="4 4" />
                            </svg>
                        </div>

                        {/* ANALYSIS PANEL */}
                        <div className={styles.analysisPanel}>
                            <h4 className={styles.analysisTitle}><TrendingUp size={16} /> AI Recommendation</h4>
                            {selectedMachine === 'CNC-01' ? (
                                <p className={`${styles.analysisContent} ${styles.critical}`}>
                                    Spindle bearing degradation detected. 98.2% probability of failure within 48 hours.
                                    <strong>Action:</strong> Schedule replacements order #SP-992 immediately.
                                </p>
                            ) : (
                                <p className={`${styles.analysisContent} ${styles.optimal}`}>
                                    System operating within nominal parameters. Next scheduled maintenance: 14 days.
                                </p>
                            )}
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
