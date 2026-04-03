'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, BarChart3, Download, FileText, RefreshCw } from 'lucide-react';
import Link from 'next/link';
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

function SectionHeader({ title, onExport }: { title: string; onExport?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
      {onExport && (
        <button onClick={onExport} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'var(--surface-muted)', border: '1px solid var(--card-border)', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: 'var(--muted-foreground)' }}>
          <Download size={12} /> Export CSV
        </button>
      )}
    </div>
  );
}

function exportCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]).join(',');
  const body = rows.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([headers + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click();
  URL.revokeObjectURL(url);
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 10, borderRadius: 99, background: 'var(--surface-muted)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [joints, setJoints] = useState<any[]>([]);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [ndeRecords, setNdeRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [sumRes, linesRes, spoolsRes, jointsRes, ncrsRes, ndeRes] = await Promise.all([
      fetch('/api/pipe-spool/summary'),
      fetch('/api/pipe-spool/lines'),
      fetch('/api/pipe-spool/spools'),
      fetch('/api/pipe-spool/joints'),
      fetch('/api/pipe-spool/ncr'),
      fetch('/api/pipe-spool/nde'),
    ]);
    const [sumData, linesData, spoolsData, jointsData, ncrsData, ndeData] = await Promise.all([
      sumRes.json(), linesRes.json(), spoolsRes.json(), jointsRes.json(), ncrsRes.json(), ndeRes.json(),
    ]);
    setSummary(sumData.summary);
    setLines(linesData.lines ?? []);
    setSpools(spoolsData.spools ?? []);
    setJoints(jointsData.joints ?? []);
    setNcrs(ncrsData.ncrs ?? []);
    setNdeRecords(ndeData.records ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const STATUS_COLOR: Record<string, string> = {
    ...SPOOL_STATUS_COLORS,
    ...JOINT_STATUS_COLORS,
    NDE_PENDING: '#8b5cf6', NDE_CLEAR: '#06b6d4',
  };

  const spoolStatusSummary = Object.entries(summary?.spoolsByStatus ?? {}).map(([status, count]) => ({ Status: status.replace('_', ' '), Count: count }));
  const jointStatusSummary = Object.entries(summary?.jointsByStatus ?? {}).map(([status, count]) => ({ Status: status.replace('_', ' '), Count: count }));

  const spoolExportRows = spools.map(s => ({
    SpoolID: s.spoolId,
    Line: s.line?.lineNumber ?? '',
    Status: s.status,
    RFID: s.rfidTag1 ?? '',
    Barcode: s.barcode ?? '',
    StorageLocation: [s.storageZone, s.storageRack, s.storageRow, s.storagePosition].filter(Boolean).join('-'),
  }));

  const jointExportRows = joints.map(j => ({
    JointID: j.jointId,
    Spool: j.spool?.spoolId ?? '',
    Type: j.jointType,
    Status: j.status,
    Welds: j._count?.weldRecords ?? 0,
    NDE: j._count?.ndeRecords ?? 0,
    NCRs: j._count?.ncrs ?? 0,
    Hold: j.holdFlag ? 'YES' : 'NO',
  }));

  const ndeExportRows = ndeRecords.map(r => ({
    Joint: r.joint?.jointId ?? '',
    Type: r.ndeType,
    Result: r.result,
    ReportNo: r.reportNumber ?? '',
    Contractor: r.ndeContractor ?? '',
    Hold: r.holdFlag ? 'YES' : 'NO',
  }));

  const ncrExportRows = ncrs.map(n => ({
    NCRNumber: n.ncrNumber,
    Severity: n.severity,
    Status: n.status,
    Spool: n.spool?.spoolId ?? '',
    Joint: n.joint?.jointId ?? '',
    RaisedBy: n.raisedBy,
    Description: n.description ?? '',
    RaisedAt: n.raisedAt ? new Date(n.raisedAt).toLocaleDateString() : '',
  }));

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading reports…</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 4 }}>
            <Link href="/pipe-spool" style={{ color: 'inherit', textDecoration: 'none' }}>Pipe Spool</Link>
            <ChevronRight size={14} />
            <span>Reports</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Project Reports</h1>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Overall KPIs */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Lines', value: summary.totalLines, color: '#3b82f6' },
            { label: 'Spools', value: summary.totalSpools, color: '#8b5cf6' },
            { label: 'Joints', value: summary.totalJoints, color: '#f59e0b' },
            { label: 'Open NCRs', value: summary.openNCRs, color: '#ef4444' },
            { label: 'NDE Holds', value: summary.ndeHolds, color: '#f97316' },
            { label: 'Pending Approvals', value: summary.pendingApprovals, color: '#06b6d4' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Progress Report */}
      {summary && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, marginBottom: 24, boxShadow: 'var(--shadow-soft)' }}>
          <SectionHeader title="Progress Report" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12, fontWeight: 600 }}>Spool Installation Progress</div>
              <ProgressBar pct={summary.completionRate} color="#10b981" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {Object.entries(summary.spoolsByStatus).map(([s, c]) => (
                  <div key={s} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 99, background: (STATUS_COLOR[s] ?? '#64748b') + '22', color: STATUS_COLOR[s] ?? '#64748b', fontWeight: 600 }}>
                    {s.replace('_', ' ')}: {c}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12, fontWeight: 600 }}>Weld Joint Completion</div>
              <ProgressBar pct={summary.weldCompletionRate} color="#f59e0b" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {Object.entries(summary.jointsByStatus).map(([s, c]) => (
                  <div key={s} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 99, background: (STATUS_COLOR[s] ?? '#64748b') + '22', color: STATUS_COLOR[s] ?? '#64748b', fontWeight: 600 }}>
                    {s.replace('_', ' ')}: {c}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spool Register Export */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, marginBottom: 24, boxShadow: 'var(--shadow-soft)' }}>
        <SectionHeader title={`Spool Register (${spools.length})`} onExport={() => exportCSV(spoolExportRows, 'spool-register')} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>{['Spool ID', 'Line', 'Status', 'RFID', 'Storage'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {spools.slice(0, 20).map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{s.spoolId}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted-foreground)' }}>{s.line?.lineNumber ?? '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: (STATUS_COLOR[s.status] ?? '#64748b') + '22', color: STATUS_COLOR[s.status] ?? '#64748b' }}>{s.status.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '9px 12px', fontSize: 11, color: '#8b5cf6' }}>{s.rfidTag1 ?? '—'}</td>
                  <td style={{ padding: '9px 12px', fontSize: 11 }}>{[s.storageZone, s.storageRack].filter(Boolean).join('-') || '—'}</td>
                </tr>
              ))}
              {spools.length > 20 && <tr><td colSpan={5} style={{ padding: '8px 12px', color: 'var(--muted-foreground)', fontSize: 12 }}>+ {spools.length - 20} more rows — export CSV to see all</td></tr>}
              {spools.length === 0 && <tr><td colSpan={5} style={{ padding: '12px', color: 'var(--muted-foreground)', fontSize: 13 }}>No data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weld / Joint Summary */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, marginBottom: 24, boxShadow: 'var(--shadow-soft)' }}>
        <SectionHeader title={`Weld Summary (${joints.length} joints)`} onExport={() => exportCSV(jointExportRows, 'weld-summary')} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>{['Joint ID', 'Spool', 'Type', 'Status', 'Welds', 'NDE', 'NCRs', 'Hold'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {joints.slice(0, 20).map(j => (
                <tr key={j.id} style={{ borderTop: '1px solid var(--border)', background: j.holdFlag ? '#f59e0b06' : 'transparent' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{j.jointId}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted-foreground)' }}>{j.spool?.spoolId ?? '—'}</td>
                  <td style={{ padding: '9px 12px', fontSize: 11 }}>{j.jointType.replace('_', ' ')}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: (STATUS_COLOR[j.status] ?? '#64748b') + '22', color: STATUS_COLOR[j.status] ?? '#64748b' }}>{j.status.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>{j._count?.weldRecords ?? 0}</td>
                  <td style={{ padding: '9px 12px' }}>{j._count?.ndeRecords ?? 0}</td>
                  <td style={{ padding: '9px 12px', color: (j._count?.ncrs ?? 0) > 0 ? '#ef4444' : 'var(--muted-foreground)', fontWeight: (j._count?.ncrs ?? 0) > 0 ? 700 : 400 }}>{j._count?.ncrs ?? 0}</td>
                  <td style={{ padding: '9px 12px' }}>{j.holdFlag ? '⚠️' : ''}</td>
                </tr>
              ))}
              {joints.length > 20 && <tr><td colSpan={8} style={{ padding: '8px 12px', color: 'var(--muted-foreground)', fontSize: 12 }}>+ {joints.length - 20} more rows</td></tr>}
              {joints.length === 0 && <tr><td colSpan={8} style={{ padding: '12px', color: 'var(--muted-foreground)', fontSize: 13 }}>No data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* NDE Status Report */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, marginBottom: 24, boxShadow: 'var(--shadow-soft)' }}>
        <SectionHeader title={`NDE Status Report (${ndeRecords.length})`} onExport={() => exportCSV(ndeExportRows, 'nde-status')} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {['PENDING', 'ACCEPTABLE', 'REJECTABLE', 'REPAIR'].map(r => {
            const count = ndeRecords.filter(rec => rec.result === r).length;
            const colorMap: Record<string, string> = { PENDING: '#94a3b8', ACCEPTABLE: '#10b981', REJECTABLE: '#ef4444', REPAIR: '#f59e0b' };
            const c = colorMap[r];
            return (
              <div key={r} style={{ padding: '8px 16px', borderRadius: 8, background: c + '22', border: `1px solid ${c}44`, fontSize: 12, fontWeight: 600, color: c }}>
                {r}: {count}
              </div>
            );
          })}
        </div>
        {ndeRecords.filter(r => r.holdFlag).length > 0 && (
          <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b44', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f59e0b', marginBottom: 12 }}>
            ⚠️ {ndeRecords.filter(r => r.holdFlag).length} records on HOLD — require re-test or disposition
          </div>
        )}
      </div>

      {/* NCR Report */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-soft)' }}>
        <SectionHeader title={`NCR Log (${ncrs.length})`} onExport={() => exportCSV(ncrExportRows, 'ncr-log')} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface-muted)' }}>
              <tr>{['NCR No.', 'Date', 'Severity', 'Status', 'Spool/Joint', 'Description', 'Raised By'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {ncrs.map(n => {
                const sc = ({ OPEN: '#ef4444', UNDER_REVIEW: '#f59e0b', DISPOSITION: '#8b5cf6', CLOSED: '#10b981' } as Record<string, string>)[n.status] ?? '#64748b';
                const sev = ({ MINOR: '#f59e0b', MAJOR: '#f97316', CRITICAL: '#ef4444' } as Record<string, string>)[n.severity] ?? '#64748b';
                return (
                  <tr key={n.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#ef4444' }}>{n.ncrNumber}</td>
                    <td style={{ padding: '9px 12px' }}>{new Date(n.raisedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '9px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sev + '22', color: sev }}>{n.severity}</span></td>
                    <td style={{ padding: '9px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc + '22', color: sc }}>{n.status.replace('_', ' ')}</span></td>
                    <td style={{ padding: '9px 12px' }}>{n.spool?.spoolId ?? n.joint?.jointId ?? '—'}</td>
                    <td style={{ padding: '9px 12px', maxWidth: 200 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.description}</div></td>
                    <td style={{ padding: '9px 12px', color: 'var(--muted-foreground)' }}>{n.raisedBy}</td>
                  </tr>
                );
              })}
              {ncrs.length === 0 && <tr><td colSpan={7} style={{ padding: '12px', color: 'var(--muted-foreground)', fontSize: 13 }}>No NCRs — all clear</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
