'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, ShieldAlert, Circle } from 'lucide-react';
import Link from 'next/link';

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, any> = {
  NCR_RAISED: ShieldAlert,
  HOLD_PLACED: AlertTriangle,
  INSPECTION_FAILED: AlertTriangle,
  NDE_HOLD: Circle,
  APPROVAL_REQUIRED: CheckCheck,
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  WARNING: '#f59e0b',
  INFO: '#3b82f6',
};

export default function SpoolAlertBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/pipe-spool/alerts?unread=false');
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setUnread(data.unreadCount ?? 0);
    } catch { /* no-op */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id: string) => {
    await fetch('/api/pipe-spool/alerts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', id }),
    });
    load();
  };

  const markAll = async () => {
    await fetch('/api/pipe-spool/alerts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
    load();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px', borderRadius: 8, color: 'inherit',
          display: 'flex', alignItems: 'center',
        }}
        title="Pipe Spool Alerts"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0, width: 16, height: 16,
            background: '#ef4444', borderRadius: '50%', fontSize: 9, fontWeight: 700,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid var(--card-bg)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%', width: 360, maxHeight: 480,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 12, boxShadow: 'var(--shadow-card)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Spool Alerts {unread > 0 && <span style={{ color: '#ef4444' }}>({unread})</span>}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {unread > 0 && (
                <button onClick={markAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>
                No alerts
              </div>
            ) : alerts.map(alert => {
              const Icon = TYPE_ICON[alert.type] ?? Bell;
              const color = SEV_COLOR[alert.severity] ?? '#64748b';
              return (
                <div
                  key={alert.id}
                  style={{
                    padding: '12px 14px', borderBottom: '1px solid var(--border)',
                    background: alert.read ? 'transparent' : color + '08',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    cursor: alert.link ? 'pointer' : 'default',
                  }}
                  onClick={() => { if (!alert.read) markRead(alert.id); }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Icon size={14} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: alert.read ? 500 : 700, color: 'var(--foreground)' }}>{alert.title}</span>
                      {!alert.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '2px 0 4px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {alert.message}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{new Date(alert.createdAt).toLocaleString()}</span>
                      {alert.link && (
                        <Link href={alert.link} onClick={() => setOpen(false)} style={{ fontSize: 10, color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                          View →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
