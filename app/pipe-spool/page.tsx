'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers, GitBranch, Circle, AlertTriangle, CheckCircle2, Clock,
  Package, FileSearch, ShieldAlert, BarChart3, MapPin, RefreshCw, Activity,
  ChevronRight, Tag,
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
  inspector: string;
  spool?: { spoolId: string };
  joint?: { jointId: string };
  itpStep?: { description: string };
}

const STATUS_COLOR: Record<string, string> = {
  ...SPOOL_STATUS_COLORS,
  ...JOINT_STATUS_COLORS,
  IN_PROGRESS: '#3b82f6',
};

// Human-readable status labels for factory floor workers
const SPOOL_STATUS_LABELS: Record<string, string> = {
  FABRICATING:      'Being Made',
  RECEIVED:         'Received at Yard',
  IN_STORAGE:       'Stored in Yard',
  ISSUED:           'Issued to Site',
  FIT_UP:           'Fit-Up in Progress',
  WELDED:           'Welding Done',
  NDE_PENDING:      'Weld Test Pending',
  NDE_CLEAR:        'Passed Weld Test',
  PRESSURE_TESTED:  'Pressure Tested',
  COMPLETE:         'Complete',
  HOLD:             'On Hold',
  REPAIR:           'Under Repair',
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon: Icon, href, urgent }: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: any;
  href?: string;
  urgent?: boolean;
}) {
  const card = (
    <div style={{
      background: 'var(--card-bg)',
      border: `1px solid ${urgent ? color + '60' : 'var(--card-border)'}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 14,
      padding: '20px 22px',
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
      boxShadow: urgent ? `0 4px 20px ${color}22` : 'var(--shadow-soft)',
      transition: 'transform 0.15s, box-shadow 0.15s',
      cursor: href ? 'pointer' : 'default',
      minHeight: '110px',
    }}
      onMouseEnter={e => href && ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.transform = 'none')}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: color + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: urgent ? color : 'var(--foreground)', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 5, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color, marginTop: 3, fontWeight: 700 }}>{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{card}</Link> : card;
}

// ── Module Card ───────────────────────────────────────────────────────────────

function ModuleCard({ href, icon: Icon, label, desc, color }: {
  href: string; icon: any; label: string; desc: string; color: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 14, padding: '22px 24px',
        display: 'flex', gap: 16, alignItems: 'flex-start',
        boxShadow: 'var(--shadow-soft)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        cursor: 'pointer', minHeight: '90px',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 28px ${color}22`;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = 'none';
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-soft)';
        }}
      >
        <div style={{
          width: 50, height: 50, borderRadius: 12, background: color + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={24} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>{label}</div>
          <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
        </div>
        <ChevronRight size={18} color="var(--muted-foreground)" style={{ flexShrink: 0, marginTop: 4 }} />
      </div>
    </Link>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, color = '#10b981', label, height = 10 }: {
  value: number; color?: string; label?: string; height?: number;
}) {
  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}%</span>
        </div>
      )}
      <div style={{ height, borderRadius: 99, background: 'var(--surface-muted)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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
    { href: '/pipe-spool/line-list',    icon: Layers,      label: 'Pipe Lines',              desc: 'View all pipe lines and their engineering drawings', color: '#3b82f6' },
    { href: '/pipe-spool/spools',       icon: Package,     label: 'Spool Tracker',           desc: 'Track every spool — location, status, RFID tag', color: '#8b5cf6' },
    { href: '/pipe-spool/joints',       icon: GitBranch,   label: 'Joints & Welds',          desc: 'Record weld completions and welder details', color: '#f59e0b' },
    { href: '/pipe-spool/inspections',  icon: FileSearch,  label: 'Inspections',             desc: 'Run inspection checklists and record results', color: '#06b6d4' },
    { href: '/pipe-spool/nde',          icon: Circle,      label: 'Weld Testing (NDE)',      desc: 'X-ray and ultrasonic test results for welds', color: '#10b981' },
    { href: '/pipe-spool/ncr',          icon: ShieldAlert, label: 'Issues & Defects',        desc: 'Log and track any quality issues found', color: '#ef4444' },
    { href: '/pipe-spool/pressure-tests', icon: Activity,  label: 'Pressure Tests',          desc: 'Record hydrostatic and pneumatic test results', color: '#ec4899' },
    { href: '/pipe-spool/yard',         icon: MapPin,      label: 'Storage Yard',            desc: 'Find where each spool is stored in the yard', color: '#f97316' },
    { href: '/pipe-spool/reports',      icon: BarChart3,   label: 'Reports',                 desc: 'View progress reports and export for handover', color: '#22c55e' },
    { href: '/pipe-spool/scan',         icon: Tag,         label: 'RFID Scanner',            desc: 'Scan RFID tags to look up any spool instantly', color: '#8b5cf6' },
    { href: '/pipe-spool/itp-builder',  icon: FileSearch,  label: 'Inspection Templates',    desc: 'Build and manage inspection test plans (ITP)', color: '#6366f1' },
    { href: '/pipe-spool/drawings',     icon: Layers,      label: 'Drawing Register',        desc: 'Store and find engineering drawings by spool', color: '#0ea5e9' },
  ];

  const totalSpoolsForBar = summary ? Object.values(summary.spoolsByStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipe Spool Installation Tracker</h1>
          <p className="page-subtitle">
            Track every spool from fabrication to final handover — inspections, welds, tests and approvals in one place
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', minHeight: 44,
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
            color: 'var(--muted-foreground)', fontSize: 13, fontWeight: 600,
          }}
        >
          <RefreshCw size={15} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          {loading ? 'Loading…' : `Updated ${lastRefresh.toLocaleTimeString()}`}
        </button>
      </div>

      {/* ── KPI Summary Bar ───────────────────────────────────────────────────── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
          <KpiCard label="Total Pipe Lines" value={summary.totalLines} icon={Layers} color="#3b82f6" href="/pipe-spool/line-list" />
          <KpiCard label="Total Spools" value={summary.totalSpools} icon={Package} color="#8b5cf6" href="/pipe-spool/spools" />
          <KpiCard
            label="Spools Complete"
            value={`${summary.completionRate}%`}
            sub="of all spools finished"
            icon={CheckCircle2}
            color={summary.completionRate >= 80 ? '#10b981' : summary.completionRate >= 50 ? '#f59e0b' : '#ef4444'}
          />
          <KpiCard
            label="Open Issues (NCR)"
            value={summary.openNCRs}
            sub={summary.criticalNCRs > 0 ? `${summary.criticalNCRs} Critical — action needed!` : 'No critical issues'}
            icon={AlertTriangle}
            color="#ef4444"
            href="/pipe-spool/ncr"
            urgent={summary.criticalNCRs > 0}
          />
          <KpiCard
            label="Awaiting Sign-off"
            value={summary.pendingApprovals}
            sub="Approvals needed"
            icon={Clock}
            color="#06b6d4"
            urgent={summary.pendingApprovals > 0}
          />
          <KpiCard
            label="Welds on Hold"
            value={summary.ndeHolds}
            sub="Awaiting re-inspection"
            icon={Circle}
            color="#f97316"
            href="/pipe-spool/nde"
            urgent={summary.ndeHolds > 0}
          />
        </div>
      )}

      {/* ── Spool Status Distribution Bar ────────────────────────────────────── */}
      {summary && totalSpoolsForBar > 0 && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-soft)', marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Current Status of All Spools</h2>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--muted-foreground)' }}>
            Where every spool is right now — click any colour block to filter
          </p>

          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 36, borderRadius: 10, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
            {Object.entries(summary.spoolsByStatus).map(([status, count]) => {
              const pct = (count / totalSpoolsForBar) * 100;
              const color = STATUS_COLOR[status] ?? '#64748b';
              if (pct < 1) return null;
              return (
                <Link
                  key={status}
                  href={`/pipe-spool/spools?status=${status}`}
                  title={`${SPOOL_STATUS_LABELS[status] ?? status}: ${count} spools (${pct.toFixed(0)}%)`}
                  style={{ flex: pct, background: color, minWidth: 4, transition: 'filter 0.15s', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.filter = 'none'}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {Object.entries(summary.spoolsByStatus).map(([status, count]) => {
              const color = STATUS_COLOR[status] ?? '#64748b';
              const pct = ((count / totalSpoolsForBar) * 100).toFixed(0);
              return (
                <Link key={status} href={`/pipe-spool/spools?status=${status}`} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 99,
                  background: color + '18', border: `1px solid ${color}40`,
                  textDecoration: 'none',
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color }}>
                    {SPOOL_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>
                    {count} ({pct}%)
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Progress ─────────────────────────────────────────────────────────── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-soft)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Overall Project Progress</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted-foreground)' }}>How much of the total project is finished</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <ProgressBar
                value={summary.completionRate}
                color={summary.completionRate >= 80 ? '#10b981' : summary.completionRate >= 50 ? '#f59e0b' : '#ef4444'}
                label="Spool Installation Complete"
              />
              <ProgressBar value={summary.weldCompletionRate} color="#f59e0b" label="Weld Joints Complete" />
            </div>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-soft)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Weld Joints</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted-foreground)' }}>Total: {summary.totalJoints} joints recorded</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(summary.jointsByStatus).map(([status, count]) => {
                const color = STATUS_COLOR[status] ?? '#64748b';
                return (
                  <div key={status} style={{
                    padding: '6px 14px', borderRadius: 99,
                    background: color + '20', color, fontSize: 12, fontWeight: 700,
                    border: `1px solid ${color}35`,
                  }}>
                    {status.replace(/_/g, ' ')}: <strong>{count}</strong>
                  </div>
                );
              })}
              {Object.keys(summary.jointsByStatus).length === 0 && (
                <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>No joint data recorded yet</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Module Navigation Grid ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: 'var(--foreground)' }}>
          What do you want to do?
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 18, marginTop: 0 }}>
          Click any section below to get started
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {modules.map(m => (
            <ModuleCard key={m.href} {...m} />
          ))}
        </div>
      </div>

      {/* ── Recent Inspections Table ──────────────────────────────────────────── */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-soft)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recent Inspections</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>Latest inspection results — PASS means work is approved, FAIL needs action</p>
        </div>

        {recentInspections.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: 0 }}>No inspections recorded yet.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {['Date', 'Spool / Joint', 'What Was Checked', 'Inspector Name', 'Result'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentInspections.map(ins => {
                const isPassed = ins.result === 'PASS';
                const isFailed = ins.result === 'FAIL';
                return (
                  <tr key={ins.id}>
                    <td style={{ fontSize: 13 }}>{new Date(ins.inspectedAt).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 700, fontSize: 14 }}>
                      {ins.spool?.spoolId ?? ins.joint?.jointId ?? '—'}
                    </td>
                    <td style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
                      {ins.itpStep?.description ?? '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{ins.inspector}</td>
                    <td>
                      {isPassed && (
                        <span className="badge--pass">
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
                          PASSED
                        </span>
                      )}
                      {isFailed && (
                        <span className="badge--fail">
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                          FAILED
                        </span>
                      )}
                      {!isPassed && !isFailed && (
                        <span className="badge--pending">
                          {ins.result}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
