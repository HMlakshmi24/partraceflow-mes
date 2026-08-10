'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, Plus, Settings } from 'lucide-react';
import styles from './connectors.module.css';

interface EdgeDevice {
    id: string;
    name: string;
    deviceType: string;
    ipAddress: string;
    port: number;
    protocol: string;
    status: string;
    lastSeen: string | null;
    tagCount?: number;
}

export default function ConnectorsPage() {
    const [devices, setDevices] = useState<EdgeDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', deviceType: 'PLC', ipAddress: '', port: '4840', protocol: 'OPCUA' });
    const [adding, setAdding] = useState(false);

    const loadDevices = useCallback(async () => {
        try {
            const res = await fetch('/api/edge-devices');
            if (!res.ok) throw new Error('Failed to load devices');
            const data = await res.json();
            setDevices(data.devices ?? []);
            setError('');
        } catch {
            setError('Unable to load edge devices.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadDevices(); }, [loadDevices]);

    const statusColor = (s: string) => {
        if (s === 'ONLINE') return '#10b981';
        if (s === 'ERROR') return '#ef4444';
        return '#64748b';
    };

    const statusIcon = (s: string) => {
        if (s === 'ONLINE') return <Wifi size={14} color="#10b981" />;
        if (s === 'ERROR') return <AlertTriangle size={14} color="#ef4444" />;
        return <WifiOff size={14} color="#64748b" />;
    };

    return (
        <div style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--foreground)' }}>
                        <Settings size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
                        Edge Device Integrations
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        Manage PLC, OPC-UA, MQTT, and sensor gateway connections.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => { setLoading(true); loadDevices(); }} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem',
                        borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--card-bg)',
                        color: 'var(--foreground)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                    }}>
                        <RefreshCw size={14} style={loading ? { animation: 'spin 0.7s linear infinite' } : {}} />
                        Refresh
                    </button>
                    <button onClick={() => setShowAdd(true)} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem',
                        borderRadius: 8, border: 'none', background: '#3b82f6',
                        color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                    }}>
                        <Plus size={14} /> Add Device
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: '0.88rem', fontWeight: 600, marginBottom: '1rem' }}>
                    {error}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)' }}>
                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                    Loading devices...
                </div>
            ) : devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12 }}>
                    <WifiOff size={40} style={{ margin: '0 auto 1rem', color: 'var(--muted-foreground)', opacity: 0.5 }} />
                    <p style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--foreground)', marginBottom: '0.5rem' }}>No edge devices configured</p>
                    <p style={{ fontSize: '0.88rem', color: 'var(--muted-foreground)' }}>
                        Register PLC gateways, OPC-UA servers, or MQTT brokers via the API to start receiving shop floor data.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {devices.map(d => (
                        <div key={d.id} style={{
                            display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
                            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
                            borderLeft: `4px solid ${statusColor(d.status)}`,
                        }}>
                            <div style={{ flexShrink: 0 }}>{statusIcon(d.status)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--foreground)' }}>{d.name}</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 2 }}>
                                    <span>{d.deviceType}</span>
                                    <span>{d.protocol}</span>
                                    <span>{d.ipAddress}:{d.port}</span>
                                    {d.lastSeen && <span>Last seen: {new Date(d.lastSeen).toLocaleString()}</span>}
                                </div>
                            </div>
                            <span style={{
                                padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                                background: `${statusColor(d.status)}20`, color: statusColor(d.status),
                            }}>
                                {d.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {showAdd && (
                <div onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>Register Edge Device</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Device Name *</label>
                                <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. CNC-001 PLC Gateway" style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--card-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--surface-muted)', color: 'var(--foreground)' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Device Type</label>
                                    <select value={addForm.deviceType} onChange={e => setAddForm(f => ({ ...f, deviceType: e.target.value }))} style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--card-border)', fontSize: '0.9rem', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
                                        <option value="PLC">PLC</option>
                                        <option value="OPCUA_GATEWAY">OPC-UA Gateway</option>
                                        <option value="MQTT_GATEWAY">MQTT Broker</option>
                                        <option value="SENSOR_NODE">Sensor Node</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Protocol</label>
                                    <select value={addForm.protocol} onChange={e => setAddForm(f => ({ ...f, protocol: e.target.value }))} style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--card-border)', fontSize: '0.9rem', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
                                        <option value="OPCUA">OPC-UA</option>
                                        <option value="MQTT">MQTT</option>
                                        <option value="MODBUS">Modbus</option>
                                        <option value="REST">REST API</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>IP Address *</label>
                                    <input value={addForm.ipAddress} onChange={e => setAddForm(f => ({ ...f, ipAddress: e.target.value }))} placeholder="192.168.1.100" style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--card-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--surface-muted)', color: 'var(--foreground)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4, color: 'var(--foreground)' }}>Port *</label>
                                    <input value={addForm.port} onChange={e => setAddForm(f => ({ ...f, port: e.target.value }))} placeholder="4840" style={{ width: '100%', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--card-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--surface-muted)', color: 'var(--foreground)' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setShowAdd(false)} style={{ padding: '0.6rem 1.25rem', borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)' }}>Cancel</button>
                                <button disabled={adding || !addForm.name || !addForm.ipAddress} onClick={async () => {
                                    setAdding(true);
                                    try {
                                        const res = await fetch('/api/edge-devices', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ name: addForm.name, deviceType: addForm.deviceType, ipAddress: addForm.ipAddress, port: parseInt(addForm.port) || 4840, protocol: addForm.protocol }),
                                        });
                                        if (res.ok) { setShowAdd(false); setAddForm({ name: '', deviceType: 'PLC', ipAddress: '', port: '4840', protocol: 'OPCUA' }); loadDevices(); }
                                        else { const d = await res.json(); setError(d.error || 'Failed to add device'); }
                                    } catch { setError('Network error'); }
                                    setAdding(false);
                                }} style={{ padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none', background: adding ? '#94a3b8' : '#3b82f6', cursor: adding ? 'not-allowed' : 'pointer', fontWeight: 700, color: '#fff' }}>
                                    {adding ? 'Adding...' : 'Register Device'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
