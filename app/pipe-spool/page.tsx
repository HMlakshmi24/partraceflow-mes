'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers, GitBranch, Circle, AlertTriangle, CheckCircle2, Clock,
  Package, Wrench, FileSearch, ShieldAlert, BarChart3, MapPin, RefreshCw, Activity,
} from 'lucide-react';
import { SPOOL_STATUS_COLORS, JOINT_STATUS_COLORS } from '@/lib/spoolStatus';

interface Summary {
  totalLines: number;
  totalSpools: number;
  totalJoints: number;
  completionRate: number;
  weldCompletionRate: number;
  openNCRs: number;
  criticalNCRs: number;
  ndeHolds: number;
  pendingApprovals: number;
  spoolsByStatus: Record<string, number>;
  jointsByStatus: Record<string, number>;
}

interface RecentInspection {
  id: string;
  inspectedAt: string;
  result: string;
  inspectorName: string;
  spool?: { spoolId: string };
  joint?: { jointId: string };
  itpStep?: { stepName: string };
}

const STATUS_COLOR: Record<string, string> = {
  ...SPOOL_STATUS_COLORS,
  ...JOINT_STATUS_COLORS,
  IN_PROGRESS: '#3b82f6',
};

function KpiCard({ label, value, sub, color, icon: Icon, href }: {
  label: string; value: string | number; sub?: string; color: string;
  icon: any; href?: string;
}) {
  const card = (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
      borderRadius: 14, padding: '20px 24px', display: 'flex', gap: 16,
      alignItems: 'flex-start', boxShadow: 'var(--shadow-soft)',
      transition: 'transform 0.15s', cursor: href ? 'pointer' : 'default',
    }}
      onMouseEnter={e => href && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = 'none')}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{card}</Link> : card;
}

function ProgressBar({ value, color = '#10b981', label }: { value: number; color?: string; label?: string }) {
  return (
    <div>
      {label && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{value}%</span>
      </div>}
      <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-muted)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

export default function PipeSpoolDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentInspections, setRecentInspections] = useState<RecentInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pipe-spool/summary');
      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
        setRecentInspections(data.recentInspections ?? []);
        setLastRefresh(new Date());
      }
    } catch (e) { /* no-op */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const modules = [
    { href: '/pipe-spool/tracker', icon: Activity, label: 'Workflow Tracker', desc: 'Interactive spool pipeline execution', color: '#ec4899' },
    { href: '/pipe-spool/line-list', icon: Layers, label: 'Line List', desc: 'P&ID lines, isometric drawings', color: '#3b82f6' },
    { href: '/pipe-spool/spools', icon: Package, label: 'Spool Register', desc: 'Spool tracking, RFID, storage', color: '#8b5cf6' },
    { href: '/pipe-spool/joints', icon: GitBranch, label: 'Joints & Welds', desc: 'Weld records, WPS, welder IDs', color: '#f59e0b' },
    { href: '/pipe-spool/inspections', icon: FileSearch, label: 'Inspection (ITP)', desc: 'Inspection test plans, HOLD/WITNESS', color: '#06b6d4' },
    { href: '/pipe-spool/nde', icon: Circle, label: 'NDE / RT', desc: 'Radiography, UT, MT, PT records', color: '#10b981' },
    { href: '/pipe-spool/ncr', icon: ShieldAlert, label: 'NCR System', desc: 'Non-conformance reports', color: '#ef4444' },
    { href: '/pipe-spool/yard', icon: MapPin, label: 'Yard Management', desc: 'Storage zones, rack positions', color: '#f97316' },
    { href: '/pipe-spool/reports', icon: BarChart3, label: 'Reports', desc: 'Weld summary, NDE status, traceability', color: '#22c55e' },
  ];

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
            Pipe Spool Installation System
          </h1>
          <p style={{ color: 'var(--muted-foreground)', margin: '6px 0 0', fontSize: 14 }}>
            EPC / Oil & Gas Grade — RFID + Barcode Dual Tracking
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 8, cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: 13,
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Loading…' : `Refreshed ${lastRefresh.toLocaleTimeString()}`}
        </button>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          <KpiCard label="Total Lines" value={summary.totalLines} icon={Layers} color="#3b82f6" href="/pipe-spool/line-list" />
          <KpiCard label="Total Spools" value={summary.totalSpools} icon={Package} color="#8b5cf6" href="/pipe-spool/spools" />
          <KpiCard label="Total Joints" value={summary.totalJoints} icon={GitBranch} color="#f59e0b" href="/pipe-spool/joints" />
          <KpiCard label="Spool Completion" value={`${summary.completionRate}%`} icon={CheckCircle2} color="#10b981" />
          <KpiCard label="Open NCRs" value={summary.openNCRs}
            sub={summary.criticalNCRs > 0 ? `${summary.criticalNCRs} CRITICAL` : undefined}
            icon={AlertTriangle} color="#ef4444" href="/pipe-spool/ncr" />
          <KpiCard label="NDE Holds" value={summary.ndeHolds} icon={Circle} color="#f97316" href="/pipe-spool/nde" />
          <KpiCard label="Pending Approvals" value={summary.pendingApprovals} icon={Clock} color="#06b6d4" />
          <KpiCard label="Weld Completion" value={`${summary.weldCompletionRate}%`} icon={Wrench} color="#22c55e" href="/pipe-spool/joints" />
        </div>
      )}

      {/* Progress + Status */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
          {/* Completion Progress */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-soft)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600 }}>Overall Progress</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ProgressBar value={summary.completionRate} color="#10b981" label="Spool Installation Complete" />
              <ProgressBar value={summary.weldCompletionRate} color="#f59e0b" label="Weld Joints Complete" />
            </div>
          </div>

          {/* Spool Status Breakdown */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-soft)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Spool Status Breakdown</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(summary.spoolsByStatus).map(([status, count]) => (
                <div key={status} style={{
                  padding: '6px 12px', borderRadius: 99,
                  background: (STATUS_COLOR[status] ?? '#64748b') + '22',
                  color: STATUS_COLOR[status] ?? '#64748b',
                  fontSize: 12, fontWeight: 600,
                }}>
                  {status.replace('_', ' ')}: {count}
                </div>
              ))}
              {Object.keys(summary.spoolsByStatus).length === 0 && (
                <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>No spool data yet</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Module Grid */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>Modules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {modules.map(m => (
            <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 14,
                alignItems: 'flex-start', boxShadow: 'var(--shadow-soft)',
                transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'pointer',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-soft)'; }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: m.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <m.icon size={18} color={m.color} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 }}>{m.desc}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Inspections */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-soft)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Recent Inspections</h3>
        {recentInspections.length === 0 ? (
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13, margin: 0 }}>No inspections recorded yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Spool/Joint', 'Step', 'Inspector', 'Result'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentInspections.map(ins => {
                const rc = ins.result === 'PASS' ? '#10b981' : ins.result === 'FAIL' ? '#ef4444' : '#f59e0b';
                return (
                  <tr key={ins.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>{new Date(ins.inspectedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px' }}>{ins.spool?.spoolId ?? ins.joint?.jointId ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{ins.itpStep?.stepName ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{ins.inspectorName}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 99, background: rc + '22', color: rc, fontSize: 11, fontWeight: 700 }}>
                        {ins.result}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
