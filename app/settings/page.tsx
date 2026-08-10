'use client';

import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon, ShieldCheck, Database, Globe, Bell } from 'lucide-react';
import styles from './settings.module.css';
import Link from 'next/link';

type TabKey = 'general' | 'notifications' | 'system';

interface PlantInfo {
  enterprise: string;
  plant: string;
  timezone: string;
}

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<TabKey>('general');
    const [plantInfo, setPlantInfo] = useState<PlantInfo | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [session, setSession] = useState<{ username: string; role: string } | null>(null);

    const [healthStatus, setHealthStatus] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        fetch('/api/session').then(r => r.json())
            .then(d => setSession({ username: d.username, role: d.role }))
            .catch(() => {});

        fetch('/api/health').then(r => r.json())
            .then(d => setHealthStatus(d))
            .catch(() => {});

        fetch('/api/pipe-spool/summary').then(r => r.json())
            .then(d => {
                if (d.enterprise || d.plant) {
                    setPlantInfo({
                        enterprise: d.enterprise ?? '',
                        plant: d.plant ?? '',
                        timezone: d.timezone ?? 'UTC',
                    });
                }
            })
            .catch(() => {});
    }, []);

    const isAdmin = session?.role === 'ADMIN';

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}><SettingsIcon /> System Configuration</h1>
                    <div className={styles.subtitle}>Manage system settings, integrations, and user access.</div>
                </div>
                {session && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                        <ShieldCheck size={14} /> Signed in as <strong style={{ color: 'var(--foreground)' }}>{session.username}</strong> ({session.role})
                    </div>
                )}
            </div>

            <div className={styles.layout}>
                <div className={styles.sidebar}>
                    <Tab active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={<SettingsIcon size={18} />} label="General" />
                    <Tab active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} icon={<Bell size={18} />} label="Notifications" />
                    <Tab active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon={<Database size={18} />} label="System Health" />
                    <div style={{ borderTop: '1px solid var(--card-border)', margin: '0.75rem 0', padding: '0.75rem 0 0' }}>
                        <Link href="/settings/users" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', color: 'var(--foreground)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, background: 'rgba(59,130,246,0.08)' }}>
                            <Globe size={18} /> User Management &rarr;
                        </Link>
                        <Link href="/settings/connectors" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', color: 'var(--foreground)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, marginTop: '0.25rem' }}>
                            <Database size={18} /> Integrations &rarr;
                        </Link>
                    </div>
                </div>

                <div className={styles.contentCard}>
                    {activeTab === 'general' && (
                        <div>
                            <h2 className={styles.sectionTitle}>Plant Information</h2>
                            {plantInfo ? (
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Enterprise</label>
                                        <div style={{ padding: '0.6rem', background: 'var(--surface-muted)', borderRadius: '0.5rem', fontSize: '0.95rem', color: 'var(--foreground)' }}>
                                            {plantInfo.enterprise || 'Not configured'}
                                        </div>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Plant</label>
                                        <div style={{ padding: '0.6rem', background: 'var(--surface-muted)', borderRadius: '0.5rem', fontSize: '0.95rem', color: 'var(--foreground)' }}>
                                            {plantInfo.plant || 'Not configured'}
                                        </div>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Timezone</label>
                                        <div style={{ padding: '0.6rem', background: 'var(--surface-muted)', borderRadius: '0.5rem', fontSize: '0.95rem', color: 'var(--foreground)' }}>
                                            {plantInfo.timezone}
                                        </div>
                                        <div className={styles.helper}>Configure via the Setup page or database.</div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(59,130,246,0.06)', border: '2px dashed rgba(59,130,246,0.3)', borderRadius: '0.75rem' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>&#9881;</div>
                                    <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--foreground)', marginBottom: '0.5rem' }}>First-Time Setup Required</p>
                                    <p style={{ fontSize: '0.88rem', color: 'var(--muted-foreground)', marginBottom: '1.25rem', maxWidth: 400, margin: '0 auto 1.25rem' }}>
                                        Configure your enterprise name, plant, timezone, and create your first admin account to get started.
                                    </p>
                                    <Link href="/setup" style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                                        padding: '0.75rem 2rem', background: '#3b82f6', color: '#fff',
                                        borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.95rem',
                                        textDecoration: 'none',
                                    }}>
                                        Run Initial Setup Wizard
                                    </Link>
                                </div>
                            )}

                            {!isAdmin && (
                                <div style={{ marginTop: '1.5rem', padding: '0.85rem 1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.75rem', color: '#f59e0b', fontSize: '0.88rem', fontWeight: 600 }}>
                                    Admin role required to modify system settings.
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div>
                            <h2 className={styles.sectionTitle}>Notification Channels</h2>
                            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                Configure how alerts are delivered to operators and supervisors.
                            </p>
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {[
                                    { type: 'Andon Board', desc: 'Visual alerts on shop floor displays', status: 'Active' },
                                    { type: 'Email', desc: 'Email notifications for critical events', status: 'Not configured' },
                                    { type: 'Webhook', desc: 'HTTP callbacks for external integrations', status: 'Not configured' },
                                ].map(ch => (
                                    <div key={ch.type} style={{ padding: '1rem', background: 'var(--surface-muted)', borderRadius: '0.75rem', border: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: 'var(--foreground)' }}>{ch.type}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>{ch.desc}</div>
                                        </div>
                                        <span style={{
                                            padding: '3px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700,
                                            background: ch.status === 'Active' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.1)',
                                            color: ch.status === 'Active' ? '#10b981' : '#64748b',
                                        }}>
                                            {ch.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'system' && (
                        <div>
                            <h2 className={styles.sectionTitle}>System Health</h2>
                            {healthStatus ? (
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    {Object.entries(healthStatus).map(([key, val]) => (
                                        <div key={key} style={{ padding: '0.75rem 1rem', background: 'var(--surface-muted)', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--foreground)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                    Loading system health...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <div onClick={onClick} className={`${styles.tab} ${active ? styles.tabActive : ''}`}>
            {icon} {label}
        </div>
    );
}
