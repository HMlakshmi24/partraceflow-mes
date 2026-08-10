'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = { from: string; to: string };
type ReportTab = 'production' | 'qc' | 'operator' | 'shift' | 'oee' | 'downtime' | 'alarms';

interface ProductionSummary { totalCompleted: number; totalQuantity: number; avgOnTimeRate: number | null; avgCycleTimeHours: number | null }
interface DailyRow { date: string; completed: number; quantity: number; total: number; onTimeRate: number | null; avgCycleTimeHours: number | null }
interface ProductionReport { summary: ProductionSummary; daily: DailyRow[]; period: Period }

interface QCSummary { totalChecks: number; passCount: number; failCount: number; reworkCount: number; passRate: number | null; failRate: number | null; inspectionPassRate: number | null }
interface DefectRow { type: string; count: number }
interface ReworkRow { orderNumber: string; reworkCount: number }
interface QCReport { summary: QCSummary; topDefects: DefectRow[]; topReworkOrders: ReworkRow[]; period: Period }

interface OperatorRow { operatorId: string; username: string; role: string; tasksCompleted: number; avgTaskDurationMinutes: number; lastActive: string | null; qualityPassRate?: number | null }
interface OperatorReport { operators: OperatorRow[]; period: Period }

interface ShiftRow { scheduleId: string; date: string; shiftName: string | null; productionLine: string; targetQuantity: number; actualQuantity: number; goodQuantity: number; scrapQuantity: number; plannedDowntime: number; unplannedDowntime: number; oee: number | null; operatorCount: number }
interface ShiftSummary { totalShifts: number; totalGood: number; totalScrap: number; avgOEE: number | null; totalDowntime: number }
interface ShiftReport { summary: ShiftSummary; rows: ShiftRow[]; period: Period }

interface OEESnapshot { periodStart: string; availability: number; performance: number; quality: number; oee: number; goodCount: number; rejectCount: number }
interface OEEMachine { machineId: string; machineName: string; machineCode: string; avgOEE: number | null; snapshots: OEESnapshot[] }
interface OEESummary { machineCount: number; avgOEE: number | null; avgAvailability: number | null; avgPerformance: number | null; avgQuality: number | null }
interface OEEReport { summary: OEESummary; machines: OEEMachine[]; period: Period }

interface DowntimeEvent { id: string; machineName: string; machineCode: string; reasonName: string | null; categoryName: string | null; categoryType: string | null; startTime: string; endTime: string | null; durationMinutes: number | null; status: string }
interface DowntimeByMachine { machineId: string; machineName: string; eventCount: number; totalMinutes: number }
interface DowntimeSummary { eventCount: number; totalMinutes: number; plannedMinutes: number; unplannedMinutes: number; avgDurationMinutes: number | null }
interface DowntimeReport { summary: DowntimeSummary; byMachine: DowntimeByMachine[]; events: DowntimeEvent[]; period: Period }

interface AlarmEvent { id: string; machineName: string; alarmCode: string; severity: string; message: string | null; startTime: string; durationMinutes: number | null; acknowledged: boolean; acknowledgedBy: string | null }
interface AlarmBySeverity { severity: string; count: number }
interface AlarmSummary { total: number; bySeverity: AlarmBySeverity[]; acknowledged: number; unacknowledged: number; avgAckMinutes: number | null }
interface AlarmReport { summary: AlarmSummary; events: AlarmEvent[]; period: Period }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmt(n: number | null | undefined, suffix = '') { return n != null ? `${n}${suffix}` : 'N/A'; }
function fmtMin(minutes: number) {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
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

function SeverityBadge({ sev }: { sev: string }) {
    const cls = sev === 'CRITICAL' ? 'bg-red-100 text-red-700' : sev === 'HIGH' ? 'bg-orange-100 text-orange-700' : sev === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600';
    return <span className={`${cls} text-xs px-2 py-0.5 rounded-full font-medium`}>{sev}</span>;
}

// ─── Export button ────────────────────────────────────────────────────────────

interface ExportButtonProps {
    reportType: string;
    format: 'pdf' | 'csv';
    params: Record<string, string | undefined>;
    label?: string;
}

function ExportButton({ reportType, format, params, label }: ExportButtonProps) {
    const [busy, setBusy] = useState(false);

    const handleExport = async () => {
        setBusy(true);
        try {
            const res = await fetch('/api/reports/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportType, format, ...params }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Export failed' }));
                alert(err.error ?? 'Export failed');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${reportType}-${params.from ?? 'report'}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert('Export failed. Please retry.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            onClick={handleExport}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors disabled:opacity-50
              bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
        >
            {busy ? 'Exporting…' : (label ?? (format === 'pdf' ? 'Export PDF' : 'Export CSV'))}
        </button>
    );
}

// ─── Tab panel components ──────────────────────────────────────────────────────

function ProductionTab({ data, exportParams }: { data: ProductionReport; exportParams: Record<string, string> }) {
    const s = data.summary;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Completed Orders" value={String(s.totalCompleted)} />
                <StatCard label="Total Quantity" value={s.totalQuantity.toLocaleString()} />
                <StatCard label="Avg On-Time Rate" value={fmt(s.avgOnTimeRate, '%')} />
                <StatCard label="Avg Cycle Time" value={fmt(s.avgCycleTimeHours, 'h')} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">Daily Breakdown</h2>
                    <div className="flex gap-2">
                        <ExportButton reportType="production" format="csv" params={exportParams} />
                        <ExportButton reportType="production" format="pdf" params={exportParams} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>{['Date','Total Orders','Completed','Quantity','On-Time %','Avg Cycle (h)'].map(h => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.daily.map(row => (
                                <tr key={row.date} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-mono">{row.date}</td>
                                    <td className="px-4 py-2">{row.total}</td>
                                    <td className="px-4 py-2">{row.completed}</td>
                                    <td className="px-4 py-2">{row.quantity}</td>
                                    <td className="px-4 py-2">{fmt(row.onTimeRate, '%')}</td>
                                    <td className="px-4 py-2">{fmt(row.avgCycleTimeHours)}</td>
                                </tr>
                            ))}
                            {data.daily.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No data for this period</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function ShiftTab({ data, exportParams }: { data: ShiftReport; exportParams: Record<string, string> }) {
    const s = data.summary;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="Total Shifts" value={String(s.totalShifts)} />
                <StatCard label="Good Output" value={s.totalGood.toLocaleString()} />
                <StatCard label="Total Scrap" value={s.totalScrap.toLocaleString()} />
                <StatCard label="Avg OEE" value={fmt(s.avgOEE != null ? +s.avgOEE.toFixed(1) : null, '%')} />
                <StatCard label="Total Downtime" value={fmtMin(s.totalDowntime)} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">Shift Detail</h2>
                    <div className="flex gap-2">
                        <ExportButton reportType="shift" format="csv" params={exportParams} />
                        <ExportButton reportType="shift" format="pdf" params={exportParams} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>{['Date','Shift','Line','Target','Actual','Good','Scrap','Downtime','OEE','Operators'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.rows.map(r => (
                                <tr key={r.scheduleId} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 font-mono">{r.date}</td>
                                    <td className="px-3 py-2">{r.shiftName ?? '—'}</td>
                                    <td className="px-3 py-2">{r.productionLine}</td>
                                    <td className="px-3 py-2">{r.targetQuantity}</td>
                                    <td className="px-3 py-2">{r.actualQuantity}</td>
                                    <td className="px-3 py-2 text-green-700">{r.goodQuantity}</td>
                                    <td className="px-3 py-2 text-red-600">{r.scrapQuantity}</td>
                                    <td className="px-3 py-2">{fmtMin(r.plannedDowntime + r.unplannedDowntime)}</td>
                                    <td className="px-3 py-2">{r.oee != null ? `${r.oee.toFixed(1)}%` : '—'}</td>
                                    <td className="px-3 py-2">{r.operatorCount}</td>
                                </tr>
                            ))}
                            {data.rows.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">No shift data for this period</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function OEETab({ data, exportParams }: { data: OEEReport; exportParams: Record<string, string> }) {
    const s = data.summary;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="Machines" value={String(s.machineCount)} />
                <StatCard label="Avg OEE" value={fmt(s.avgOEE != null ? +s.avgOEE.toFixed(1) : null, '%')} />
                <StatCard label="Avg Availability" value={fmt(s.avgAvailability != null ? +s.avgAvailability.toFixed(1) : null, '%')} />
                <StatCard label="Avg Performance" value={fmt(s.avgPerformance != null ? +s.avgPerformance.toFixed(1) : null, '%')} />
                <StatCard label="Avg Quality" value={fmt(s.avgQuality != null ? +s.avgQuality.toFixed(1) : null, '%')} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">OEE by Machine</h2>
                    <div className="flex gap-2">
                        <ExportButton reportType="oee" format="csv" params={exportParams} />
                        <ExportButton reportType="oee" format="pdf" params={exportParams} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>{['Machine','Code','Avg OEE','Snapshots'].map(h => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.machines.map(m => (
                                <tr key={m.machineId} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium">{m.machineName}</td>
                                    <td className="px-4 py-2 font-mono text-xs">{m.machineCode}</td>
                                    <td className="px-4 py-2">
                                        {m.avgOEE != null ? (
                                            <span className={`font-semibold ${m.avgOEE >= 85 ? 'text-green-600' : m.avgOEE >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                                                {m.avgOEE.toFixed(1)}%
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className="px-4 py-2">{m.snapshots.length}</td>
                                </tr>
                            ))}
                            {data.machines.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No OEE data for this period</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function DowntimeTab({ data, exportParams }: { data: DowntimeReport; exportParams: Record<string, string> }) {
    const s = data.summary;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="Total Events" value={String(s.eventCount)} />
                <StatCard label="Total Downtime" value={fmtMin(s.totalMinutes)} />
                <StatCard label="Planned" value={fmtMin(s.plannedMinutes)} />
                <StatCard label="Unplanned" value={fmtMin(s.unplannedMinutes)} />
                <StatCard label="Avg Duration" value={s.avgDurationMinutes != null ? fmtMin(s.avgDurationMinutes) : '—'} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-700">By Machine</h2></div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr><th className="px-4 py-2 text-left">Machine</th><th className="px-4 py-2 text-right">Events</th><th className="px-4 py-2 text-right">Total Time</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.byMachine.map(m => (
                                <tr key={m.machineId} className="hover:bg-gray-50">
                                    <td className="px-4 py-2">{m.machineName}</td>
                                    <td className="px-4 py-2 text-right">{m.eventCount}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs">{fmtMin(m.totalMinutes)}</td>
                                </tr>
                            ))}
                            {data.byMachine.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No data</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">Downtime Events</h2>
                    <div className="flex gap-2">
                        <ExportButton reportType="downtime" format="csv" params={exportParams} />
                        <ExportButton reportType="downtime" format="pdf" params={exportParams} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>{['Machine','Start','Duration','Reason','Type','Status'].map(h => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.events.slice(0, 100).map(e => (
                                <tr key={e.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2">{e.machineName}</td>
                                    <td className="px-4 py-2 font-mono text-xs">{e.startTime.slice(0, 16).replace('T', ' ')}</td>
                                    <td className="px-4 py-2">{e.durationMinutes != null ? fmtMin(e.durationMinutes) : '—'}</td>
                                    <td className="px-4 py-2">{e.reasonName ?? '—'}</td>
                                    <td className="px-4 py-2"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{e.categoryType ?? '—'}</span></td>
                                    <td className="px-4 py-2">{e.status}</td>
                                </tr>
                            ))}
                            {data.events.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No downtime events</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function AlarmsTab({ data, exportParams }: { data: AlarmReport; exportParams: Record<string, string> }) {
    const s = data.summary;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Alarms" value={String(s.total)} />
                <StatCard label="Acknowledged" value={String(s.acknowledged)} />
                <StatCard label="Unacknowledged" value={String(s.unacknowledged)} sub="Require attention" />
                <StatCard label="Avg Ack Time" value={s.avgAckMinutes != null ? fmtMin(s.avgAckMinutes) : '—'} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-700">By Severity</h2></div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr><th className="px-4 py-2 text-left">Severity</th><th className="px-4 py-2 text-right">Count</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {s.bySeverity.map(sv => (
                                <tr key={sv.severity} className="hover:bg-gray-50">
                                    <td className="px-4 py-2"><SeverityBadge sev={sv.severity} /></td>
                                    <td className="px-4 py-2 text-right font-mono">{sv.count}</td>
                                </tr>
                            ))}
                            {s.bySeverity.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">No alarms</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">Alarm Events</h2>
                    <div className="flex gap-2">
                        <ExportButton reportType="alarms" format="csv" params={exportParams} />
                        <ExportButton reportType="alarms" format="pdf" params={exportParams} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>{['Machine','Code','Severity','Start','Duration','Status','Ack By'].map(h => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.events.slice(0, 100).map(e => (
                                <tr key={e.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2">{e.machineName}</td>
                                    <td className="px-4 py-2 font-mono text-xs">{e.alarmCode}</td>
                                    <td className="px-4 py-2"><SeverityBadge sev={e.severity} /></td>
                                    <td className="px-4 py-2 font-mono text-xs">{e.startTime.slice(0, 16).replace('T', ' ')}</td>
                                    <td className="px-4 py-2">{e.durationMinutes != null ? fmtMin(e.durationMinutes) : '—'}</td>
                                    <td className="px-4 py-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.acknowledged ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {e.acknowledged ? 'ACK' : 'OPEN'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-500">{e.acknowledgedBy ?? '—'}</td>
                                </tr>
                            ))}
                            {data.events.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No alarms in this period</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function QCTab({ data, exportParams }: { data: QCReport; exportParams: Record<string, string> }) {
    const s = data.summary;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Checks" value={String(s.totalChecks)} />
                <StatCard label="Pass Rate" value={fmt(s.passRate, '%')} />
                <StatCard label="Fail Rate" value={fmt(s.failRate, '%')} />
                <StatCard label="Inspection Pass" value={fmt(s.inspectionPassRate, '%')} />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-700">Top Defect Types</h2>
                        <ExportButton reportType="production" format="csv" params={{ ...exportParams, _note: 'qc-defects' }} label="Export CSV" />
                    </div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr><th className="px-4 py-2 text-left">Defect Type</th><th className="px-4 py-2 text-right">Count</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.topDefects.map(d => <tr key={d.type} className="hover:bg-gray-50"><td className="px-4 py-2">{d.type}</td><td className="px-4 py-2 text-right font-mono">{d.count}</td></tr>)}
                            {data.topDefects.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">No defects recorded</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-700">Top Rework Orders</h2></div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr><th className="px-4 py-2 text-left">Order</th><th className="px-4 py-2 text-right">Reworks</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.topReworkOrders.map(r => <tr key={r.orderNumber} className="hover:bg-gray-50"><td className="px-4 py-2 font-mono">{r.orderNumber}</td><td className="px-4 py-2 text-right">{r.reworkCount}</td></tr>)}
                            {data.topReworkOrders.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">No rework in this period</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function OperatorTab({ data, exportParams }: { data: OperatorReport; exportParams: Record<string, string> }) {
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">Operator Performance</h2>
                    <div className="flex gap-2">
                        <ExportButton reportType="operator" format="csv" params={exportParams} />
                        <ExportButton reportType="operator" format="pdf" params={exportParams} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>{['Operator','Role','Tasks','Avg Duration','Quality Pass','Last Active'].map(h => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.operators.map(op => (
                                <tr key={op.operatorId} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium">{op.username}</td>
                                    <td className="px-4 py-2"><span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">{op.role}</span></td>
                                    <td className="px-4 py-2">{op.tasksCompleted}</td>
                                    <td className="px-4 py-2">{fmtMin(op.avgTaskDurationMinutes)}</td>
                                    <td className="px-4 py-2">{op.qualityPassRate != null ? `${op.qualityPassRate}%` : '—'}</td>
                                    <td className="px-4 py-2 text-gray-500">{op.lastActive ? new Date(op.lastActive).toLocaleString() : '—'}</td>
                                </tr>
                            ))}
                            {data.operators.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No operator data</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: ReportTab; label: string }[] = [
    { id: 'production', label: 'Production' },
    { id: 'shift',      label: 'Shift' },
    { id: 'oee',        label: 'OEE' },
    { id: 'downtime',   label: 'Downtime' },
    { id: 'alarms',     label: 'Alarms' },
    { id: 'qc',         label: 'Quality' },
    { id: 'operator',   label: 'Operators' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
    const today      = isoDate(new Date());
    const thirtyAgo  = isoDate(new Date(Date.now() - 30 * 86_400_000));

    const [from, setFrom] = useState(thirtyAgo);
    const [to, setTo]     = useState(today);
    const [tab, setTab]   = useState<ReportTab>('production');
    const [machineId, setMachineId] = useState('');

    const [prod,     setProd]     = useState<ProductionReport | null>(null);
    const [shift,    setShift]    = useState<ShiftReport | null>(null);
    const [oee,      setOee]      = useState<OEEReport | null>(null);
    const [downtime, setDowntime] = useState<DowntimeReport | null>(null);
    const [alarms,   setAlarms]   = useState<AlarmReport | null>(null);
    const [qc,       setQc]       = useState<QCReport | null>(null);
    const [ops,      setOps]      = useState<OperatorReport | null>(null);

    const [loading, setLoading]   = useState(false);
    const [error,   setError]     = useState<string | null>(null);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        const qs = `from=${from}&to=${to}${machineId ? `&machineId=${machineId}` : ''}`;
        try {
            const [pRes, sRes, oRes, dRes, aRes, qRes, opRes] = await Promise.all([
                fetch(`/api/reports/production?${qs}`),
                fetch(`/api/reports/shift?${qs}`),
                fetch(`/api/reports/oee?${qs}`),
                fetch(`/api/reports/downtime?${qs}`),
                fetch(`/api/reports/alarms?${qs}`),
                fetch(`/api/reports/qc?${qs}`),
                fetch(`/api/reports/operator?${qs}`),
            ]);
            const failed = [pRes, sRes, oRes, dRes, aRes, qRes, opRes].filter(r => !r.ok);
            if (failed.length > 0) throw new Error(`${failed.length} report(s) failed to load`);
            const [p, s, o, d, al, q, op] = await Promise.all([pRes, sRes, oRes, dRes, aRes, qRes, opRes].map(r => r.json()));
            setProd(p); setShift(s); setOee(o); setDowntime(d); setAlarms(al); setQc(q); setOps(op);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [from, to, machineId]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const exportParams = { from, to, ...(machineId ? { machineId } : {}) };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">MES Reports</h1>
                        <p className="text-sm text-gray-500">Industrial production reporting with digital signatures</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-sm text-gray-600">From</label>
                        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <label className="text-sm text-gray-600">To</label>
                        <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <input type="text" value={machineId} onChange={e => setMachineId(e.target.value)}
                            placeholder="Machine ID (optional)"
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44" />
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
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                {loading && <div className="text-sm text-gray-400 py-8 text-center">Loading reports…</div>}

                {!loading && tab === 'production' && prod && <ProductionTab data={prod} exportParams={exportParams} />}
                {!loading && tab === 'shift'      && shift   && <ShiftTab    data={shift}   exportParams={exportParams} />}
                {!loading && tab === 'oee'        && oee     && <OEETab      data={oee}     exportParams={exportParams} />}
                {!loading && tab === 'downtime'   && downtime && <DowntimeTab data={downtime} exportParams={exportParams} />}
                {!loading && tab === 'alarms'     && alarms   && <AlarmsTab  data={alarms}  exportParams={exportParams} />}
                {!loading && tab === 'qc'         && qc       && <QCTab      data={qc}      exportParams={exportParams} />}
                {!loading && tab === 'operator'   && ops      && <OperatorTab data={ops}    exportParams={exportParams} />}
            </div>
        </div>
    );
}
