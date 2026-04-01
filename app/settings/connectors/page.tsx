'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Link, XCircle, X, RefreshCw, Terminal, Settings, Clock, Wifi, WifiOff } from 'lucide-react';
import styles from './connectors.module.css';

const INITIAL_CONNECTORS = [
    { id: 'pg',   name: 'PostgreSQL Database',  type: 'Database',  status: 'PENDING',      latency: '-',    message: 'Waiting for Phase 1 Setup',    host: 'db.factory.local',     port: '5432', protocol: 'TCP',     description: 'Production-grade relational DB. Replace SQLite in Phase 2. Run prisma migrate deploy after switching.' },
    { id: 'ns',   name: 'Oracle NetSuite',       type: 'ERP',       status: 'DISCONNECTED', latency: '-',    message: 'Auth Token Missing',           host: 'netsuite.oracle.com',  port: '443',  protocol: 'HTTPS',   description: 'Cloud ERP for purchase orders, invoicing, and inventory sync with the factory floor.' },
    { id: 'sap',  name: 'SAP S/4HANA',           type: 'ERP',       status: 'DISCONNECTED', latency: '-',    message: 'Gateway unreachable',          host: 'sap-gw.factory.local', port: '8443', protocol: 'RFC',     description: 'SAP enterprise system — syncs work orders, BOMs, and material master records.' },
    { id: 'plc',  name: 'Siemens S7-1500 PLC',   type: 'Hardware',  status: 'CONNECTED',    latency: '45ms', message: 'OPC-UA Streaming Active',      host: '192.168.1.100',        port: '4840', protocol: 'OPC-UA',  description: 'PLC (Programmable Logic Controller) = a physical computer on the factory floor that controls machines. OPC-UA streams live data: temperature, speed, alarms.' },
    { id: 'rfid', name: 'Zebra FX9600 RFID',     type: 'Hardware',  status: 'CONNECTED',    latency: '12ms', message: 'Scanning (LLRP)',              host: '192.168.1.110',        port: '5084', protocol: 'LLRP',    description: 'RFID scanner reads electronic tags on parts/pallets for automatic traceability — no manual barcode scanning needed.' },
    { id: 'mqtt', name: 'MQTT Broker',            type: 'Messaging', status: 'CONNECTED',    latency: '4ms',  message: 'Topic: factory/#',             host: 'mqtt.factory.local',   port: '1883', protocol: 'MQTT',    description: 'Lightweight IoT message bus. Machines publish sensor data (temperature, vibration, energy) every second on factory/# topics.' },
];

type Connector = typeof INITIAL_CONNECTORS[0];

const CONNECTOR_LOGS: Record<string, string[]> = {
    pg:   ['[PENDING] Awaiting PostgreSQL connection string', '[INFO] Expected env: DATABASE_URL=postgresql://user:pass@db.factory.local:5432/mes', '[INFO] Currently using: SQLite (dev.db)', '[WARN] Run npx prisma migrate deploy after switching'],
    ns:   ['[ERROR] 401 Unauthorized – OAuth2 token expired', '[WARN] Last successful sync: 3 days ago', '[INFO] Re-authenticate: Settings > ERP > NetSuite OAuth', '[INFO] Endpoint: https://netsuite.oracle.com/app/login/'],
    sap:  ['[ERROR] RFC connection timed out after 30000ms', '[WARN] SAP RFC gateway at sap-gw.factory.local:8443 unreachable', '[INFO] Check: 1) VPN active  2) Contact SAP BASIS team', '[INFO] SAP RFC SDK version: 7.5.4'],
    plc:  ['[INFO] OPC-UA session established with Siemens S7-1500', '[INFO] Subscribed to 24 node IDs (temperature, speed, alarms)', '[DATA] ns=2;s=Temperature → 68.4°C', '[DATA] ns=2;s=VibrationRMS → 1.2 mm/s', '[DATA] ns=2;s=SpindleSpeed → 1200 RPM', '[INFO] Heartbeat: OK (5000ms interval)'],
    rfid: ['[INFO] LLRP connection to Zebra FX9600 established', '[DATA] Tag EPC=A1B2C3D4E5F6 → Part PART-101', '[DATA] Tag EPC=F1E2D3C4B5A6 → Part PART-202', '[INFO] Antenna gain: 30 dBm | Read rate: 99.8%'],
    mqtt: ['[INFO] Connected to mqtt.factory.local:1883 (QoS 1)', '[SUB] Subscribed to factory/# (all factory topics)', '[DATA] factory/plc/M001/temp = 68.4', '[DATA] factory/plc/M002/speed = 1200', '[DATA] factory/sensor/energy = 42.8 kWh', '[INFO] Throughput: 12 msg/sec — nominal'],
};

export default function ConnectorsPage() {
    const [connectors, setConnectors] = useState(INITIAL_CONNECTORS);
    const [logsFor,     setLogsFor]   = useState<Connector | null>(null);
    const [configFor,   setConfigFor] = useState<Connector | null>(null);
    const [configDraft, setConfigDraft] = useState<Connector | null>(null);
    const [testing,     setTesting]   = useState(false);
    const [testResult,  setTestResult] = useState<string | null>(null);
    const [liveLogs,    setLiveLogs]  = useState<string[]>([]);

    // Simulate live latency for connected connectors
    useEffect(() => {
        const iv = setInterval(() => {
            setConnectors(prev => prev.map(c => {
                if (c.status !== 'CONNECTED') return c;
                const base: Record<string, number> = { mqtt: 4, rfid: 12, plc: 45 };
                const b = base[c.id] ?? 20;
                return { ...c, latency: `${Math.max(1, b + Math.floor(Math.random() * 8) - 4)}ms` };
            }));
        }, 2500);
        return () => clearInterval(iv);
    }, []);

    const openLogs = (c: Connector) => {
        const base = CONNECTOR_LOGS[c.id] ?? ['[INFO] No logs available'];
        const ts = new Date().toLocaleTimeString();
        setLiveLogs([...base, `[${ts}] Log panel opened`]);
        setLogsFor(c);
    };

    const openConfig = (c: Connector) => {
        setConfigDraft({ ...c });
        setConfigFor(c);
        setTestResult(null);
    };

    const handleTest = () => {
        if (!configDraft) return;
        setTesting(true); setTestResult(null);
        setTimeout(() => {
            setTesting(false);
            const ms = Math.floor(Math.random() * 50 + 5);
            if (configDraft.status === 'CONNECTED')    setTestResult(`✅ Reachable: ${configDraft.host}:${configDraft.port} (${ms}ms)`);
            else if (configDraft.status === 'PENDING') setTestResult(`⏳ Pending: Service not yet configured. Fill in credentials and retry.`);
            else                                        setTestResult(`❌ Unreachable: Cannot connect to ${configDraft.host}:${configDraft.port}. Check host/firewall.`);
        }, 1500);
    };

    const saveConfig = () => {
        if (!configDraft) return;
        setConnectors(prev => prev.map(c => c.id === configDraft.id ? configDraft : c));
        setConfigFor(null); setConfigDraft(null); setTestResult(null);
    };

    const connected    = connectors.filter(c => c.status === 'CONNECTED').length;
    const pending      = connectors.filter(c => c.status === 'PENDING').length;
    const disconnected = connectors.filter(c => c.status === 'DISCONNECTED').length;

    const inputStyle = { width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem', fontFamily: 'monospace', boxSizing: 'border-box' as const };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}><Link size={32} /> Enterprise Connectors</h1>
                    <p className={styles.subtitle}>Monitor ERP, hardware, and messaging integrations. Click &quot;Configure&quot; to set host/port, &quot;View Logs&quot; to see live data.</p>
                </div>
                <div className={styles.summary}>
                    <div className={styles.summaryCard}><div className={styles.summaryLabel}>Connected</div><div className={styles.summaryValue} style={{ color: '#10b981' }}>{connected}</div></div>
                    <div className={styles.summaryCard}><div className={styles.summaryLabel}>Pending</div><div className={styles.summaryValue} style={{ color: '#f59e0b' }}>{pending}</div></div>
                    <div className={styles.summaryCard}><div className={styles.summaryLabel}>Offline</div><div className={styles.summaryValue} style={{ color: '#ef4444' }}>{disconnected}</div></div>
                </div>
            </div>

            {/* ── View Logs Modal ── */}
            {logsFor && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setLogsFor(null); }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', width: '100%', maxWidth: '680px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                        <div style={{ background: '#1e293b', padding: '0.9rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem' }}>
                                <Terminal size={16} color="#4ade80" />
                                <span style={{ color: '#4ade80' }}>{logsFor.name}</span>
                                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.8rem' }}>— {logsFor.protocol}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, background: logsFor.status === 'CONNECTED' ? '#166534' : '#7f1d1d', color: logsFor.status === 'CONNECTED' ? '#4ade80' : '#fca5a5' }}>
                                    {logsFor.status}
                                </span>
                                <button onClick={() => setLogsFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
                            </div>
                        </div>
                        <div style={{ background: '#0f172a', padding: '1rem 1.5rem', fontFamily: 'monospace', fontSize: '0.82rem', maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {liveLogs.map((line, i) => (
                                <div key={i} style={{ color: line.startsWith('[ERROR]') ? '#f87171' : line.startsWith('[WARN]') ? '#fbbf24' : line.startsWith('[DATA]') ? '#34d399' : '#93c5fd' }}>
                                    {line}
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '0.85rem 1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb' }}>
                            <button onClick={() => { const ts = new Date().toLocaleTimeString(); setLiveLogs(prev => [...prev, `[${ts}] Refreshed — status: ${logsFor?.status}`]); }} style={{ padding: '0.45rem 1rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--foreground)' }}>
                                <RefreshCw size={14} /> Refresh
                            </button>
                            <button onClick={() => setLogsFor(null)} style={{ padding: '0.45rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#3b82f6', cursor: 'pointer', fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Configure Modal ── */}
            {configFor && configDraft && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setConfigFor(null); }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Settings size={18} /> Configure: {configFor.name}
                            </h2>
                            <button onClick={() => setConfigFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}><X size={22} /></button>
                        </div>

                        {/* Explanation for non-technical users */}
                        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.83rem', color: '#0c4a6e', lineHeight: '1.5' }}>
                            ℹ️ <strong>What is this?</strong> {configFor.description}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {[
                                { label: 'Host / IP Address', field: 'host' },
                                { label: 'Port Number',       field: 'port' },
                                { label: 'Protocol',          field: 'protocol' },
                            ].map(({ label, field }) => (
                                <div key={field}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.35rem' }}>{label}</label>
                                    <input value={(configDraft as any)[field]} onChange={e => setConfigDraft(d => d ? { ...d, [field]: e.target.value } : d)} style={inputStyle} />
                                </div>
                            ))}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.35rem' }}>Connection Status</label>
                                <select value={configDraft.status} onChange={e => setConfigDraft(d => d ? { ...d, status: e.target.value } : d)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}>
                                    <option value="CONNECTED">CONNECTED — Active and streaming data</option>
                                    <option value="DISCONNECTED">DISCONNECTED — Cannot reach endpoint</option>
                                    <option value="PENDING">PENDING — Awaiting credentials/setup</option>
                                </select>
                            </div>

                            {testResult && (
                                <div style={{ padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600, background: testResult.startsWith('✅') ? '#d1fae5' : testResult.startsWith('⏳') ? '#fef3c7' : '#fee2e2', color: testResult.startsWith('✅') ? '#065f46' : testResult.startsWith('⏳') ? '#92400e' : '#991b1b' }}>
                                    {testResult}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                                <button onClick={handleTest} disabled={testing} style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                    <Clock size={14} /> {testing ? 'Testing...' : 'Test Connection'}
                                </button>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={() => setConfigFor(null)} style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)', fontSize: '0.85rem' }}>Cancel</button>
                                    <button onClick={saveConfig} style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#3b82f6', cursor: 'pointer', fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>Save</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Cards ── */}
            <div className={styles.grid}>
                {connectors.map((c) => {
                    const statusClass = c.status === 'CONNECTED' ? styles.statusConnected : c.status === 'PENDING' ? styles.statusPending : styles.statusDisconnected;
                    return (
                        <div key={c.id} className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div className={styles.connectorMeta}>
                                    <div className={styles.iconWrap}>
                                        {c.status === 'CONNECTED' ? <Wifi size={26} color="#10b981" /> : <WifiOff size={26} color="#9ca3af" />}
                                    </div>
                                    <div>
                                        <h3 className={styles.connectorName}>{c.name}</h3>
                                        <div className={styles.connectorType}>{c.type} · {c.protocol}</div>
                                    </div>
                                </div>
                                <span className={`${styles.statusPill} ${statusClass}`}>
                                    {c.status === 'CONNECTED' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                                    {c.status}
                                </span>
                            </div>

                            <div className={styles.details}>
                                <div className={styles.detailRow}>
                                    <span>Endpoint</span>
                                    <strong style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{c.host}:{c.port}</strong>
                                </div>
                                <div className={styles.detailRow}>
                                    <span>Status</span>
                                    <strong>{c.message}</strong>
                                </div>
                                <div className={styles.detailRow}>
                                    <span>Latency</span>
                                    <span className={styles.latency} style={{ color: c.status === 'CONNECTED' ? '#10b981' : '#9ca3af', fontFamily: 'monospace', fontWeight: 700 }}>{c.latency}</span>
                                </div>
                            </div>

                            <div style={{ padding: '0.4rem 0 0.6rem', fontSize: '0.77rem', color: '#9ca3af', lineHeight: '1.45', borderTop: '1px solid #f3f4f6' }}>
                                {c.description.slice(0, 90)}{c.description.length > 90 ? '…' : ''}
                            </div>

                            <div className={styles.actions}>
                                <button className={styles.secondaryButton} onClick={() => openLogs(c)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                    <Terminal size={13} /> View Logs
                                </button>
                                <button className={styles.secondaryButton} onClick={() => openConfig(c)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                    <Settings size={13} /> Configure
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
