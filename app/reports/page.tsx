'use client';

import { useState, useEffect, useCallback } from 'react';

type Period = { from: string; to: string };

interface ProductionSummary { totalCompleted: number; totalQuantity: number; avgOnTimeRate: number | null; avgCycleTimeHours: number | null }
interface DailyRow { date: string; completed: number; quantity: number; total: number; onTimeRate: number | null; avgCycleTimeHours: number | null }
interface ProductionReport { summary: ProductionSummary; daily: DailyRow[]; period: Period }

interface QCSummary { totalChecks: number; passCount: number; failCount: number; reworkCount: number; passRate: number | null; failRate: number | null; inspectionPassRate: number | null }
interface DefectRow { type: string; count: number }
interface ReworkRow { orderNumber: string; reworkCount: number }
interface QCReport { summary: QCSummary; topDefects: DefectRow[]; topReworkOrders: ReworkRow[]; period: Period }

interface OperatorRow { operatorId: string; username: string; role: string; tasksCompleted: number; avgTaskDurationMinutes: number; lastActive: string | null }
interface OperatorReport { operators: OperatorRow[]; period: Period }

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function csvDownload(filename: string, rows: object[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

export default function ReportsPage() {
  const today = isoDate(new Date());
  const thirtyAgo = isoDate(new Date(Date.now() - 30 * 86_400_000));

  const [from, setFrom] = useState(thirtyAgo);
  const [to, setTo]     = useState(today);
  const [tab, setTab]   = useState<'production' | 'qc' | 'operator'>('production');

  const [prod, setProd]     = useState<ProductionReport | null>(null);
  const [qc, setQc]         = useState<QCReport | null>(null);
  const [ops, setOps]       = useState<OperatorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = `from=${from}&to=${to}`;
    try {
      const [pRes, qRes, oRes] = await Promise.all([
        fetch(`/api/reports/production?${qs}`),
        fetch(`/api/reports/qc?${qs}`),
        fetch(`/api/reports/operator?${qs}`),
      ]);
      if (!pRes.ok || !qRes.ok || !oRes.ok) throw new Error('One or more reports failed to load');
      const [p, q, o] = await Promise.all([pRes.json(), qRes.json(), oRes.json()]);
      setProd(p); setQc(q); setOps(o);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MES Reports</h1>
            <p className="text-sm text-gray-500">Production, quality and operator performance analytics</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-600">From</label>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            <label className="text-sm text-gray-600">To</label>
            <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={fetchReport} disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(['production', 'qc', 'operator'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'production' ? 'Production' : t === 'qc' ? 'Quality' : 'Operators'}
            </button>
          ))}
        </div>

        {/* Production Tab */}
        {tab === 'production' && prod && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Completed Orders" value={String(prod.summary.totalCompleted)} />
              <StatCard label="Total Quantity" value={prod.summary.totalQuantity.toLocaleString()} />
              <StatCard label="Avg On-Time Rate" value={prod.summary.avgOnTimeRate != null ? `${prod.summary.avgOnTimeRate}%` : '—'} />
              <StatCard label="Avg Cycle Time" value={prod.summary.avgCycleTimeHours != null ? `${prod.summary.avgCycleTimeHours}h` : '—'} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Daily Breakdown</h2>
                <button onClick={() => csvDownload('production.csv', prod.daily)}
                  className="text-xs text-blue-600 hover:underline">Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      {['Date', 'Total Orders', 'Completed', 'Quantity', 'On-Time %', 'Avg Cycle (h)'].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {prod.daily.map(row => (
                      <tr key={row.date} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono">{row.date}</td>
                        <td className="px-4 py-2">{row.total}</td>
                        <td className="px-4 py-2">{row.completed}</td>
                        <td className="px-4 py-2">{row.quantity}</td>
                        <td className="px-4 py-2">{row.onTimeRate != null ? `${row.onTimeRate}%` : '—'}</td>
                        <td className="px-4 py-2">{row.avgCycleTimeHours != null ? row.avgCycleTimeHours : '—'}</td>
                      </tr>
                    ))}
                    {prod.daily.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No data for this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* QC Tab */}
        {tab === 'qc' && qc && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Checks" value={String(qc.summary.totalChecks)} />
              <StatCard label="Pass Rate" value={qc.summary.passRate != null ? `${qc.summary.passRate}%` : '—'} />
              <StatCard label="Fail Rate" value={qc.summary.failRate != null ? `${qc.summary.failRate}%` : '—'} />
              <StatCard label="Inspection Pass" value={qc.summary.inspectionPassRate != null ? `${qc.summary.inspectionPassRate}%` : '—'} />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">Top Defect Types</h2>
                  <button onClick={() => csvDownload('defects.csv', qc.topDefects)}
                    className="text-xs text-blue-600 hover:underline">Export CSV</button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Defect Type</th>
                      <th className="px-4 py-2 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {qc.topDefects.map(d => (
                      <tr key={d.type} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{d.type}</td>
                        <td className="px-4 py-2 text-right font-mono">{d.count}</td>
                      </tr>
                    ))}
                    {qc.topDefects.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">No defects recorded</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700">Top Rework Orders</h2>
                  <button onClick={() => csvDownload('rework.csv', qc.topReworkOrders)}
                    className="text-xs text-blue-600 hover:underline">Export CSV</button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Order Number</th>
                      <th className="px-4 py-2 text-right">Rework Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {qc.topReworkOrders.map(r => (
                      <tr key={r.orderNumber} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono">{r.orderNumber}</td>
                        <td className="px-4 py-2 text-right">{r.reworkCount}</td>
                      </tr>
                    ))}
                    {qc.topReworkOrders.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">No rework in this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Operator Tab */}
        {tab === 'operator' && ops && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Operator Performance</h2>
                <button onClick={() => csvDownload('operators.csv', ops.operators)}
                  className="text-xs text-blue-600 hover:underline">Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      {['Operator', 'Role', 'Tasks Completed', 'Avg Duration (min)', 'Last Active'].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ops.operators.map(op => (
                      <tr key={op.operatorId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{op.username}</td>
                        <td className="px-4 py-2">
                          <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">{op.role}</span>
                        </td>
                        <td className="px-4 py-2">{op.tasksCompleted}</td>
                        <td className="px-4 py-2">{op.avgTaskDurationMinutes}</td>
                        <td className="px-4 py-2 text-gray-500">{op.lastActive ? new Date(op.lastActive).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    {ops.operators.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No operator data for this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
