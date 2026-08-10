'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    calcBlockLeft,
    calcBlockWidth,
    detectDropOverlap,
    isScheduleDelayed,
    calcMachineUtilization,
    conflictSeverityClass,
    utilizationColor,
    adherenceLabel,
    statusColor,
    buildRulerMarks,
    calcMaintOverlay,
    pixelToTime,
    snapToGrid,
    type MaintOverlay,
} from '@/lib/ganttUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoardConflict {
    id: string;
    machineId: string | null;
    workOrderId: string | null;
    conflictType: string;
    severity: string;
    description: string;
    isBlocking: boolean;
    detectedAt: string;
}

interface BoardWorkOrder {
    id: string;
    orderNumber: string;
    quantity: number;
    dueDate: string | null;
    status: string;
}

interface BoardMachine {
    id: string;
    code: string;
    name: string;
    status: string;
}

interface BoardSchedule {
    id: string;
    workOrderId: string;
    machineId: string;
    plannedStart: Date;
    plannedEnd: Date;
    estimatedDurationMinutes: number;
    status: string;
    driftMinutes: number | null;
    workOrder: BoardWorkOrder;
    machine: BoardMachine;
    conflicts: BoardConflict[];
    isDelayed: boolean;
}

interface CalendarData {
    id: string;
    name: string;
    workingDays: number[];
    shiftPattern: Array<{ name: string; startHour: number; endHour: number }>;
    maintenanceWindows: Array<{ start: string; end: string; reason: string }>;
    timezone: string;
}

interface MachineUtilization {
    machineId: string;
    utilizationPct: number;
}

interface DragState {
    scheduleId: string;
    durationMs: number;
    offsetMs: number; // how far into the block the cursor grabbed
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEW_HOUR_OPTIONS = [24, 48, 72] as const;
type ViewHours = typeof VIEW_HOUR_OPTIONS[number];

const MACHINE_COL_W = 192; // px, fixed left column
const ROW_H         = 56;  // px, each machine row height
const GRID_MINUTES  = 15;

// ─── Helper: parse dates from JSON response ───────────────────────────────────

function parseSchedules(raw: any[]): BoardSchedule[] {
    return raw.map(s => ({
        ...s,
        plannedStart: new Date(s.plannedStart),
        plannedEnd:   new Date(s.plannedEnd),
    }));
}

// ─── Helper: machine status badge ────────────────────────────────────────────

function MachineStatusDot({ status }: { status: string }) {
    const color =
        status === 'RUNNING'     ? 'bg-emerald-400' :
        status === 'IDLE'        ? 'bg-gray-400'    :
        status === 'DOWN'        ? 'bg-red-500'      :
        status === 'MAINTENANCE' ? 'bg-amber-400'    : 'bg-gray-300';
    return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5 flex-shrink-0`} />;
}

// ─── Helper: utilization bar ──────────────────────────────────────────────────

function UtilBar({ pct }: { pct: number }) {
    const col = utilizationColor(pct);
    const barColor =
        col === 'green' ? 'bg-emerald-400' :
        col === 'amber' ? 'bg-amber-400'   : 'bg-red-500';
    return (
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
    );
}

// ─── Helper: schedule block ───────────────────────────────────────────────────

interface BlockProps {
    schedule: BoardSchedule;
    viewStart: Date;
    viewEnd: Date;
    isDragging: boolean;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, s: BoardSchedule) => void;
    canReschedule: boolean;
}

function ScheduleBlock({ schedule, viewStart, viewEnd, isDragging, onDragStart, canReschedule }: BlockProps) {
    const [showTip, setShowTip] = useState(false);

    const left  = calcBlockLeft(schedule.plannedStart, viewStart, viewEnd);
    const width = calcBlockWidth(schedule.plannedStart, schedule.plannedEnd, viewStart, viewEnd);
    const minW  = 1; // % — minimum visible width

    const hasConflict = schedule.conflicts.length > 0;
    const worstSeverity = hasConflict
        ? schedule.conflicts.find(c => c.severity === 'CRITICAL') ? 'CRITICAL'
        : schedule.conflicts.find(c => c.severity === 'WARNING')  ? 'WARNING'
        : 'INFO'
        : null;

    const base = statusColor(schedule.status);
    const drift = schedule.driftMinutes ?? 0;
    const label = adherenceLabel(drift);

    const ringClass =
        hasConflict && worstSeverity === 'CRITICAL' ? 'ring-2 ring-red-400'   :
        hasConflict && worstSeverity === 'WARNING'  ? 'ring-2 ring-amber-400' :
        schedule.isDelayed                          ? 'ring-2 ring-orange-400': '';

    const draggable = canReschedule &&
        schedule.status !== 'IN_PROGRESS' &&
        schedule.status !== 'COMPLETED' &&
        schedule.status !== 'CANCELLED';

    return (
        <div
            className={`absolute top-1 bottom-1 rounded ${base} ${ringClass} select-none overflow-hidden
                        flex items-center px-1.5 gap-1 text-white text-xs font-medium
                        transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}
                        ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            style={{ left: `${left}%`, width: `${Math.max(minW, width)}%` }}
            draggable={draggable}
            onDragStart={draggable ? e => onDragStart(e, schedule) : undefined}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            title={schedule.workOrder.orderNumber}
        >
            {/* Conflict icon */}
            {hasConflict && (
                <span className={`flex-shrink-0 w-3 h-3 rounded-full ${conflictSeverityClass(worstSeverity!)} flex items-center justify-center text-[8px] font-bold`}>
                    !
                </span>
            )}

            {/* Delayed icon */}
            {schedule.isDelayed && !hasConflict && (
                <span className="flex-shrink-0 text-orange-200 text-[10px]">⚠</span>
            )}

            <span className="truncate">{schedule.workOrder.orderNumber}</span>

            {label !== 'on-time' && width > 8 && (
                <span className={`flex-shrink-0 text-[9px] px-0.5 rounded ${label === 'minor-delay' ? 'bg-yellow-300/30' : 'bg-red-300/40'}`}>
                    +{drift}m
                </span>
            )}

            {/* Tooltip */}
            {showTip && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-600 rounded p-2 text-xs whitespace-nowrap shadow-xl pointer-events-none"
                     style={{ minWidth: 180 }}>
                    <div className="font-bold mb-1">{schedule.workOrder.orderNumber}</div>
                    <div className="text-gray-300">Status: {schedule.status}</div>
                    <div className="text-gray-300">Qty: {schedule.workOrder.quantity}</div>
                    <div className="text-gray-300">
                        Start: {schedule.plannedStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                    <div className="text-gray-300">
                        End: {schedule.plannedEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                    {schedule.workOrder.dueDate && (
                        <div className={schedule.isDelayed ? 'text-orange-400' : 'text-gray-300'}>
                            Due: {new Date(schedule.workOrder.dueDate).toLocaleString()}
                        </div>
                    )}
                    {drift > 0 && (
                        <div className="text-amber-400">Drift: {drift} min</div>
                    )}
                    {hasConflict && (
                        <div className="mt-1 border-t border-gray-600 pt-1">
                            {schedule.conflicts.map(c => (
                                <div key={c.id} className={`text-[10px] ${c.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`}>
                                    {c.conflictType}: {c.description}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GanttBoard() {
    const [viewStart, setViewStart] = useState<Date>(() => {
        const d = new Date();
        d.setMinutes(0, 0, 0);
        return d;
    });
    const [viewHours, setViewHours]       = useState<ViewHours>(24);
    const [machines, setMachines]         = useState<BoardMachine[]>([]);
    const [schedules, setSchedules]       = useState<BoardSchedule[]>([]);
    const [conflicts, setConflicts]       = useState<BoardConflict[]>([]);
    const [utilization, setUtilization]   = useState<MachineUtilization[]>([]);
    const [calendar, setCalendar]         = useState<CalendarData | null>(null);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState<string | null>(null);
    const [toast, setToast]               = useState<string | null>(null);
    const [dragging, setDragging]         = useState<DragState | null>(null);
    const [dragOverMachine, setDragOverMachine] = useState<string | null>(null);

    const viewEnd = useMemo(
        () => new Date(viewStart.getTime() + viewHours * 3_600_000),
        [viewStart, viewHours],
    );

    // ── Data fetch ──────────────────────────────────────────────────────────

    const fetchBoard = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/schedule/board?from=${encodeURIComponent(viewStart.toISOString())}&to=${encodeURIComponent(viewEnd.toISOString())}`,
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? 'Failed to load board data');
            }
            const data = await res.json();
            setMachines(data.machines ?? []);
            setSchedules(parseSchedules(data.schedules ?? []));
            setConflicts(data.conflicts ?? []);
            setUtilization(data.machineUtilization ?? []);
            setCalendar(data.calendar ?? null);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [viewStart, viewEnd]);

    useEffect(() => { fetchBoard(); }, [fetchBoard]);

    // ── SSE real-time updates ───────────────────────────────────────────────

    useEffect(() => {
        const es = new EventSource('/api/stream');
        const refresh = () => fetchBoard();
        es.addEventListener('order.created', refresh);
        es.addEventListener('order.updated', refresh);
        es.addEventListener('machine.status.changed', refresh);
        // Heartbeat events ignored (just keep-alive)
        return () => es.close();
    }, [fetchBoard]);

    // ── Drag/drop ───────────────────────────────────────────────────────────

    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, schedule: BoardSchedule) => {
        const rect      = e.currentTarget.getBoundingClientRect();
        const grabPixel = e.clientX - rect.left;
        const blockDurationMs = schedule.plannedEnd.getTime() - schedule.plannedStart.getTime();
        // How far into the block's time span the grab occurred
        const offsetMs = (grabPixel / rect.width) * blockDurationMs;
        setDragging({ scheduleId: schedule.id, durationMs: blockDurationMs, offsetMs });
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, machineId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverMachine(machineId);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOverMachine(null);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, machineId: string) => {
        e.preventDefault();
        setDragOverMachine(null);
        if (!dragging) return;

        const trackEl = e.currentTarget as HTMLDivElement;
        const rect    = trackEl.getBoundingClientRect();

        // Raw pixel position of drop → adjust by grab offset → snap to grid
        const rawDropX   = e.clientX - rect.left;
        const rawTime    = pixelToTime(rawDropX, rect.width, viewStart, viewEnd);
        const adjustedStart = new Date(rawTime.getTime() - dragging.offsetMs);
        const snappedStart  = snapToGrid(adjustedStart, GRID_MINUTES);
        const snappedEnd    = new Date(snappedStart.getTime() + dragging.durationMs);

        // Client-side overlap check (server validates again)
        const machineBlocks = schedules.filter(s => s.machineId === machineId);
        if (detectDropOverlap(snappedStart, snappedEnd, machineBlocks, dragging.scheduleId)) {
            showToast('Cannot move: overlaps an existing schedule');
            setDragging(null);
            return;
        }

        try {
            const res = await fetch(`/api/schedule/${dragging.scheduleId}`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plannedStart: snappedStart.toISOString(),
                    plannedEnd:   snappedEnd.toISOString(),
                    machineId,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                showToast(body.error ?? 'Reschedule failed');
            } else {
                await fetchBoard();
            }
        } finally {
            setDragging(null);
        }
    }, [dragging, schedules, viewStart, viewEnd, fetchBoard]);

    const handleDragEnd = useCallback(() => {
        setDragging(null);
        setDragOverMachine(null);
    }, []);

    // ── Machine-down action ──────────────────────────────────────────────────

    const handleMachineDown = useCallback(async (machineId: string) => {
        try {
            const res = await fetch('/api/schedule/reschedule', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'machine_down', machineId }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                showToast(body.error ?? 'Failed to mark machine down');
            } else {
                showToast('Machine marked down — downstream orders flagged as DRIFTED');
                await fetchBoard();
            }
        } catch {
            showToast('Failed to communicate with server');
        }
    }, [fetchBoard]);

    // ── Conflict resolve ─────────────────────────────────────────────────────

    const handleResolveConflict = useCallback(async (conflictId: string) => {
        try {
            const res = await fetch('/api/schedule/conflicts', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: conflictId }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                showToast(body.error ?? 'Failed to resolve conflict');
            } else {
                await fetchBoard();
            }
        } catch {
            showToast('Failed to communicate with server');
        }
    }, [fetchBoard]);

    // ── Toast helper ─────────────────────────────────────────────────────────

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
    };

    // ── Derived data ─────────────────────────────────────────────────────────

    const rulerMarks = useMemo(() => buildRulerMarks(viewStart, viewEnd), [viewStart, viewEnd]);

    const maintOverlays = useMemo((): MaintOverlay[] => {
        if (!calendar?.maintenanceWindows) return [];
        const windows = calendar.maintenanceWindows as Array<{ start: string; end: string; reason: string }>;
        return windows.flatMap(w => {
            const overlay = calcMaintOverlay(new Date(w.start), new Date(w.end), viewStart, viewEnd, w.reason);
            return overlay ? [overlay] : [];
        });
    }, [calendar, viewStart, viewEnd]);

    const nowLeftPct = useMemo(() => {
        const now = Date.now();
        if (now < viewStart.getTime() || now > viewEnd.getTime()) return null;
        const total = viewEnd.getTime() - viewStart.getTime();
        return ((now - viewStart.getTime()) / total) * 100;
    }, [viewStart, viewEnd]);

    const blockingCount = useMemo(
        () => conflicts.filter(c => c.isBlocking).length,
        [conflicts],
    );
    const delayedCount = useMemo(
        () => schedules.filter(s => s.isDelayed).length,
        [schedules],
    );

    // ── Time window navigation ───────────────────────────────────────────────

    const shiftView = (directionHours: number) => {
        setViewStart(prev => new Date(prev.getTime() + directionHours * 3_600_000));
    };

    const jumpToNow = () => {
        const d = new Date();
        d.setMinutes(0, 0, 0);
        setViewStart(d);
    };

    // ── Render ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px] text-gray-400">
                <span className="animate-spin mr-2">⟳</span> Loading dispatch board…
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-400 font-medium">{error}</p>
                <button onClick={fetchBoard} className="mt-3 px-4 py-2 bg-gray-700 rounded text-sm hover:bg-gray-600">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-950 text-gray-100 select-none">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
                <h1 className="font-bold text-sm tracking-wide uppercase text-gray-300 mr-2">Dispatch Board</h1>

                {/* KPI chips */}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${blockingCount > 0 ? 'bg-red-900/60 text-red-300' : 'bg-gray-800 text-gray-400'}`}>
                    {blockingCount} blocking conflict{blockingCount !== 1 ? 's' : ''}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${delayedCount > 0 ? 'bg-orange-900/60 text-orange-300' : 'bg-gray-800 text-gray-400'}`}>
                    {delayedCount} delayed
                </span>

                <div className="flex-1" />

                {/* View window selector */}
                <div className="flex gap-1">
                    {VIEW_HOUR_OPTIONS.map(h => (
                        <button
                            key={h}
                            onClick={() => setViewHours(h)}
                            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors
                                ${viewHours === h ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                        >
                            {h}h
                        </button>
                    ))}
                </div>

                {/* Navigation */}
                <div className="flex gap-1 items-center">
                    <button onClick={() => shiftView(-viewHours / 2)} className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded">←</button>
                    <button onClick={jumpToNow} className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded font-medium">Now</button>
                    <button onClick={() => shiftView(viewHours / 2)} className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded">→</button>
                </div>

                {/* Refresh */}
                <button onClick={fetchBoard} className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded" title="Refresh">
                    ↺
                </button>

                {/* View date range label */}
                <span className="text-gray-500 text-xs">
                    {viewStart.toLocaleDateString()} {viewStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    {' – '}
                    {viewEnd.toLocaleDateString()} {viewEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
            </div>

            {/* ── Board ── */}
            <div className="flex flex-1 overflow-auto">

                {/* Left column (machine labels) */}
                <div className="flex-shrink-0" style={{ width: MACHINE_COL_W }}>
                    {/* Spacer for ruler row */}
                    <div className="h-8 border-b border-gray-800 bg-gray-900" />

                    {machines.map(m => {
                        const util = utilization.find(u => u.machineId === m.id);
                        const pct  = util?.utilizationPct ?? 0;
                        return (
                            <div
                                key={m.id}
                                className="border-b border-gray-800 bg-gray-900 px-3 flex flex-col justify-center gap-0.5"
                                style={{ height: ROW_H }}
                            >
                                <div className="flex items-center gap-1 min-w-0">
                                    <MachineStatusDot status={m.status} />
                                    <span className="text-xs font-medium text-gray-200 truncate">{m.code}</span>
                                    {m.status === 'DOWN' && (
                                        <span className="text-[9px] bg-red-800/60 text-red-300 px-1 rounded ml-auto flex-shrink-0">DOWN</span>
                                    )}
                                    {m.status === 'MAINTENANCE' && (
                                        <span className="text-[9px] bg-amber-800/60 text-amber-300 px-1 rounded ml-auto flex-shrink-0">MNT</span>
                                    )}
                                </div>
                                <div className="text-[10px] text-gray-500 truncate">{m.name}</div>
                                <UtilBar pct={pct} />
                                <div className="text-[9px] text-gray-600">{pct.toFixed(1)}% util</div>
                            </div>
                        );
                    })}
                </div>

                {/* Timeline area */}
                <div className="flex-1 overflow-x-auto relative min-w-0">

                    {/* Ruler */}
                    <div className="h-8 bg-gray-900 border-b border-gray-800 relative flex-shrink-0 sticky top-0 z-10">
                        {rulerMarks.map((m, i) => (
                            <div
                                key={i}
                                className="absolute top-0 bottom-0 flex items-end pb-1"
                                style={{ left: `${m.leftPct}%` }}
                            >
                                <span className="text-[10px] text-gray-500 -translate-x-1/2 whitespace-nowrap">
                                    {m.label}
                                </span>
                                <div className="absolute bottom-0 left-0 w-px h-2 bg-gray-700" />
                            </div>
                        ))}

                        {/* "Now" needle in ruler */}
                        {nowLeftPct !== null && (
                            <div className="absolute top-0 bottom-0 w-px bg-red-500 z-20" style={{ left: `${nowLeftPct}%` }}>
                                <span className="absolute top-0 -translate-x-1/2 text-[9px] text-red-400 font-bold whitespace-nowrap">NOW</span>
                            </div>
                        )}
                    </div>

                    {/* Machine rows */}
                    {machines.map(m => {
                        const machineSchedules = schedules.filter(s => s.machineId === m.id);
                        const isDragTarget     = dragOverMachine === m.id;

                        return (
                            <div
                                key={m.id}
                                className={`relative border-b border-gray-800 transition-colors
                                    ${isDragTarget ? 'bg-blue-950/40' : 'bg-gray-950'}`}
                                style={{ height: ROW_H }}
                                onDragOver={e => handleDragOver(e, m.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={e => handleDrop(e, m.id)}
                            >
                                {/* Maintenance overlays */}
                                {maintOverlays.map((ov, i) => (
                                    <div
                                        key={i}
                                        className="absolute top-0 bottom-0 bg-gray-700/40 border-x border-gray-600/40 pointer-events-none"
                                        style={{ left: `${ov.leftPct}%`, width: `${ov.widthPct}%` }}
                                        title={`Maintenance: ${ov.reason}`}
                                    >
                                        {/* Hatching pattern */}
                                        <div className="absolute inset-0 opacity-30"
                                             style={{
                                                 backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, #6b7280 4px, #6b7280 5px)',
                                             }}
                                        />
                                    </div>
                                ))}

                                {/* Grid lines at each ruler mark */}
                                {rulerMarks.map((mk, i) => (
                                    <div
                                        key={i}
                                        className="absolute top-0 bottom-0 w-px bg-gray-800/60 pointer-events-none"
                                        style={{ left: `${mk.leftPct}%` }}
                                    />
                                ))}

                                {/* "Now" needle */}
                                {nowLeftPct !== null && (
                                    <div
                                        className="absolute top-0 bottom-0 w-px bg-red-500/60 pointer-events-none z-10"
                                        style={{ left: `${nowLeftPct}%` }}
                                    />
                                )}

                                {/* Schedule blocks */}
                                {machineSchedules.map(s => (
                                    <ScheduleBlock
                                        key={s.id}
                                        schedule={s}
                                        viewStart={viewStart}
                                        viewEnd={viewEnd}
                                        isDragging={dragging?.scheduleId === s.id}
                                        onDragStart={handleDragStart}
                                        canReschedule={true}
                                    />
                                ))}

                                {/* Machine DOWN overlay */}
                                {m.status === 'DOWN' && (
                                    <div className="absolute inset-0 bg-red-950/30 pointer-events-none border border-red-900/30" />
                                )}

                                {/* Drop ghost hint */}
                                {isDragTarget && (
                                    <div className="absolute inset-0 border-2 border-blue-500/50 rounded pointer-events-none" />
                                )}
                            </div>
                        );
                    })}

                    {machines.length === 0 && (
                        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
                            No machines found. Add machines to see the dispatch board.
                        </div>
                    )}
                </div>
            </div>

            {/* ── Conflict panel (bottom strip) ── */}
            {conflicts.length > 0 && (
                <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 max-h-36 overflow-y-auto">
                    <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">
                        Active Conflicts ({conflicts.length})
                    </div>
                    <div className="divide-y divide-gray-800">
                        {conflicts.map(c => (
                            <div key={c.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                                <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-white text-[10px] font-bold ${conflictSeverityClass(c.severity)}`}>
                                    {c.severity}
                                </span>
                                <span className="text-gray-400">{c.conflictType}</span>
                                <span className="text-gray-300 flex-1 truncate">{c.description}</span>
                                {c.machineId && (
                                    <span className="text-gray-500 flex-shrink-0">
                                        {machines.find(m => m.id === c.machineId)?.code ?? c.machineId}
                                    </span>
                                )}
                                <button
                                    onClick={() => handleResolveConflict(c.id)}
                                    className="flex-shrink-0 px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                                >
                                    Resolve
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Machine action bar ── */}
            <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-2 flex gap-2 flex-wrap">
                {machines
                    .filter(m => m.status !== 'DOWN')
                    .map(m => (
                        <button
                            key={m.id}
                            onClick={() => handleMachineDown(m.id)}
                            className="px-2.5 py-1 text-[11px] bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-800/40 rounded transition-colors"
                            title={`Mark ${m.code} as DOWN and reschedule`}
                        >
                            {m.code} ↓ Down
                        </button>
                    ))}
                {machines.every(m => m.status === 'DOWN') && machines.length > 0 && (
                    <span className="text-xs text-gray-500 italic">All machines are already marked DOWN</span>
                )}
                {machines.length === 0 && (
                    <span className="text-xs text-gray-500 italic">No machines</span>
                )}
            </div>

            {/* ── Legend ── */}
            <div className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-4 py-2 flex items-center gap-4 text-[11px] text-gray-400 flex-wrap">
                {[
                    { label: 'Scheduled',   cls: 'bg-blue-500' },
                    { label: 'In Progress', cls: 'bg-emerald-500' },
                    { label: 'Drifted',     cls: 'bg-amber-500' },
                    { label: 'Completed',   cls: 'bg-gray-400' },
                ].map(({ label, cls }) => (
                    <span key={label} className="flex items-center gap-1">
                        <span className={`inline-block w-3 h-3 rounded ${cls}`} />
                        {label}
                    </span>
                ))}
                <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded ring-2 ring-red-400 bg-blue-500" />
                    Conflict
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded ring-2 ring-orange-400 bg-blue-500" />
                    Delayed
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-4 h-3 bg-gray-700/60" style={{ backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 2px,#6b7280 2px,#6b7280 3px)' }} />
                    Maintenance
                </span>
                <span className="ml-auto text-gray-600 italic">Drag blocks to reschedule (15-min snap)</span>
            </div>

            {/* ── Toast ── */}
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 border border-gray-600 rounded shadow-xl text-sm text-gray-100 pointer-events-none">
                    {toast}
                </div>
            )}
        </div>
    );
}
