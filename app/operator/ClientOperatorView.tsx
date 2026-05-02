'use client';

import { startTask, completeTask } from '@/lib/actions/workflow';
import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';
import { CheckCircle, Play, Clock, AlertTriangle, Workflow, ListTodo, X, User, Cpu, Lock, Info } from 'lucide-react';
import styles from './operator.module.css';

const DOWNTIME_REASONS = [
    'Machine Breakdown',
    'Tooling Change',
    'Material Shortage',
    'Quality Issue',
    'Setup / Changeover',
    'Planned Maintenance',
    'Operator Break',
    'Waiting for Instructions',
    'Other',
];

type OperatorUser = { id: string; username: string; role: string };
type OperatorMachine = { id: string; code: string; name: string; status: string };
type Activity = {
    id: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    performedBy: string | null;
    role: string | null;
    machine: string | null;
    operator: string | null;
    notes: string | null;
    timestamp: string | Date;
};

function getShiftLabel(now: Date) {
    const h = now.getHours();
    if (h >= 6 && h < 14) return 'Shift A';
    if (h >= 14 && h < 22) return 'Shift B';
    return 'Shift C';
}

function getPriorityLabel(priority: number): string {
    if (priority >= 4) return 'URGENT';
    if (priority === 3) return 'P3';
    if (priority === 2) return 'P2';
    return 'P1';
}

function getPriorityColor(priority: number): string {
    if (priority >= 4) return '#dc2626';
    if (priority === 3) return '#ea580c';
    if (priority === 2) return '#ca8a04';
    return '#6b7280';
}

function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate).getTime() < Date.now();
}

function formatDueDate(dueDate: string | null): string {
    if (!dueDate) return '';
    return new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getActivityColor(action: string): string {
    if (action === 'TASK_COMPLETED' || action === 'STATUS_CHANGE') return '#10b981';
    if (action === 'TASK_STARTED') return '#3b82f6';
    if (action === 'QC_RESULT') return '#f59e0b';
    if (action === 'ALERT') return '#ef4444';
    if (action === 'CREATED') return '#8b5cf6';
    return '#64748b';
}

function getActivityLabel(action: string): string {
    const map: Record<string, string> = {
        TASK_STARTED: 'Step Started',
        TASK_COMPLETED: 'Step Completed',
        STATUS_CHANGE: 'Status Changed',
        QC_RESULT: 'QC Inspection',
        ALERT: 'Alert',
        CREATED: 'Order Created',
        NOTE: 'Note',
    };
    return map[action] ?? action;
}

export default function ClientOperatorView({
    initialTasks,
    initialActivities,
    operators,
    machines,
}: {
    initialTasks: any[];
    initialActivities: Activity[];
    operators: OperatorUser[];
    machines: OperatorMachine[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const defaultOperator = operators[0]?.username ?? 'operator';
    const [activeOperator, setActiveOperator] = useState(defaultOperator);

    const [showIssue, setShowIssue] = useState(false);
    const [issueReason, setIssueReason] = useState('Machine Breakdown');
    const [issueNotes, setIssueNotes] = useState('');
    const [issueMachine, setIssueMachine] = useState(machines[0]?.id ?? '');
    const [issueSubmitting, setIssueSubmitting] = useState(false);
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
    const activeMachine = machines.find(m => m.id === issueMachine) ?? machines[0];
    const [showQcFail, setShowQcFail] = useState(false);
    const [qcSubmitting, setQcSubmitting] = useState(false);
    const [qcParam, setQcParam] = useState('Visual Inspection');
    const [qcDefect, setQcDefect] = useState('Dimensional Error');
    const [qcNotes, setQcNotes] = useState('');

    const showToast = (text: string, ok: boolean) => {
        setToast({ text, ok });
        setTimeout(() => setToast(null), 4000);
    };

    const handleStart = async (taskId: string) => {
        startTransition(async () => {
            const result = await startTask(taskId, activeOperator);
            if (!result.success) {
                showToast(`Cannot start: ${result.msg}`, false);
            } else {
                showToast('Step started!', true);
            }
            router.refresh();
        });
    };

    const handleComplete = async (taskId: string) => {
        startTransition(async () => {
            const result = await completeTask(taskId, activeOperator);
            if (!result.success) {
                showToast(`Cannot complete: ${result.msg}`, false);
            } else {
                showToast('Step completed! Order routed to QC.', true);
            }
            router.refresh();
        });
    };

    const handleReportIssue = async () => {
        if (!issueReason || !issueMachine) return;
        setIssueSubmitting(true);
        try {
            const res = await fetch('/api/downtime', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'start',
                    machineId: issueMachine,
                    reason: issueReason,
                    notes: issueNotes,
                    reportedBy: activeOperator,
                })
            });
            if (res.ok) {
                showToast(`Issue reported: ${issueReason}`, true);
                setShowIssue(false);
                setIssueNotes('');
                setIssueReason('Machine Breakdown');
                router.refresh();
            } else {
                showToast('Failed to report issue', false);
            }
        } catch {
            showToast('Network error', false);
        } finally {
            setIssueSubmitting(false);
        }
    };

    // QC FAIL only — QC PASS requires task to be COMPLETED first (enforced server-side)
    const submitQcFail = async () => {
        if (!activeTask) return;
        setQcSubmitting(true);
        try {
            const res = await fetch('/api/quality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'task_qc',
                    taskId: activeTask.id,
                    parameter: qcParam,
                    expected: 'PASS',
                    actual: qcDefect,
                    result: 'FAIL',
                    notes: qcNotes,
                })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('QC failure recorded — order sent to REWORK', true);
                setShowQcFail(false);
                setQcNotes('');
                router.refresh();
            } else {
                showToast(`QC submission failed: ${data.error ?? 'Unknown error'}`, false);
            }
        } catch {
            showToast('Network error', false);
        } finally {
            setQcSubmitting(false);
        }
    };

    const activeTask = initialTasks.find(t => t.status === 'IN_PROGRESS');
    const pendingTasks = initialTasks.filter(t => t.status === 'PENDING');

    return (
        <>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000,
                    padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600, color: '#fff',
                    background: toast.ok ? '#10b981' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)', maxWidth: '420px'
                }}>
                    {toast.text}
                </div>
            )}

            {/* Report Issue Modal */}
            {showIssue && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }} onClick={e => { if (e.target === e.currentTarget) setShowIssue(false); }}>
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem',
                        width: '100%', maxWidth: '480px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={20} color="#f59e0b" /> Report Issue / Downtime
                            </h2>
                            <button onClick={() => setShowIssue(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                                <X size={22} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Machine</label>
                                <select value={issueMachine} onChange={e => setIssueMachine(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}>
                                    {machines.length === 0 && <option value="">— No machines found —</option>}
                                    {machines.map(m => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Downtime Reason</label>
                                <select value={issueReason} onChange={e => setIssueReason(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}>
                                    {DOWNTIME_REASONS.map(r => <option key={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Notes (optional)</label>
                                <textarea value={issueNotes} onChange={e => setIssueNotes(e.target.value)}
                                    placeholder="Describe the issue..." rows={3}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setShowIssue(false)}
                                    style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)' }}>
                                    Cancel
                                </button>
                                <button onClick={handleReportIssue} disabled={issueSubmitting}
                                    style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertTriangle size={16} /> {issueSubmitting ? 'Submitting...' : 'Submit Downtime'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* QC Fail Modal */}
            {showQcFail && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }} onClick={e => { if (e.target === e.currentTarget) setShowQcFail(false); }}>
                    <div style={{
                        background: 'var(--card-bg)', borderRadius: '1rem', padding: '2rem',
                        width: '100%', maxWidth: '460px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={20} color="#ef4444" /> Record QC Failure
                            </h2>
                            <button onClick={() => setShowQcFail(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                                <X size={22} />
                            </button>
                        </div>
                        <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                            This will send order <strong>{activeTask?.orderNumber}</strong> to REWORK status.
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>QC Parameter</label>
                                <select value={qcParam} onChange={e => setQcParam(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}>
                                    {['Visual Inspection', 'Dimensional Check', 'Weld Inspection', 'Surface Finish', 'Pressure Test', 'NDT Check'].map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Defect Type</label>
                                <select value={qcDefect} onChange={e => setQcDefect(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}>
                                    {['Dimensional Error', 'Surface Defect', 'Bad Weld', 'Discoloration', 'Crack/Fracture', 'Wrong Part', 'Porosity', 'Undercut', 'Other'].map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Notes (optional)</label>
                                <textarea value={qcNotes} onChange={e => setQcNotes(e.target.value)}
                                    placeholder="Describe the defect in detail..." rows={3}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button onClick={() => setShowQcFail(false)}
                                    style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)' }}>
                                    Cancel
                                </button>
                                <button onClick={submitQcFail} disabled={qcSubmitting}
                                    style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertTriangle size={16} /> {qcSubmitting ? 'Submitting...' : 'Record Failure'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Station status strip */}
            <div className={styles.statusStrip}>
                <div className={styles.statusTile}>
                    <div className={styles.statusLabel}>Station</div>
                    <div className={styles.statusValue}>
                        {activeMachine ? `${activeMachine.code} — ${activeMachine.name}` : 'No station selected'}
                    </div>
                    <div className={`${styles.statusBadge} ${styles[`status${(activeMachine?.status ?? 'IDLE').toUpperCase()}`] ?? ''}`}>
                        {(activeMachine?.status ?? 'IDLE').toUpperCase()}
                    </div>
                </div>
                <div className={styles.statusTile}>
                    <div className={styles.statusLabel}>Current Order</div>
                    <div className={styles.statusValue}>{activeTask?.orderNumber ?? 'No active order'}</div>
                    <div className={styles.statusMeta}>{activeTask?.stepName ?? 'Waiting for assignment'}</div>
                </div>
                <div className={styles.statusTile}>
                    <div className={styles.statusLabel}>Shift</div>
                    <div className={styles.statusValue}>{getShiftLabel(new Date())}</div>
                    <div className={styles.statusMeta}>{new Date().toLocaleTimeString()}</div>
                </div>
            </div>

            {/* Operator selector bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <User size={18} style={{ color: '#60a5fa', flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>Logged in as:</span>
                {operators.length > 0 ? (
                    <select value={activeOperator} onChange={e => setActiveOperator(e.target.value)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '0.4rem', border: '1px solid rgba(255,255,255,0.15)', background: '#1e2d3d', color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
                        {operators.map(op => (
                            <option key={op.id} value={op.username}>{op.username} ({op.role})</option>
                        ))}
                    </select>
                ) : (
                    <span style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>operator</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b' }}>Seed demo data in Settings to populate operators</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '2rem', height: 'calc(100vh - 170px)' }}>

                {/* LEFT COLUMN: ACTION & QUEUE */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto' }}>

                    {/* ACTIVE JOB CARD */}
                    <section className={styles.currentOrderSection}>
                        <h2 className={styles.sectionTitle}>
                            <Workflow className={styles.sectionIcon} /> Current Job
                        </h2>

                        {activeTask ? (
                            <div>
                                <div className={styles.orderHeader}>
                                    <div className={styles.orderField}>
                                        <span className={styles.orderLabel}>Production Order</span>
                                        <span className={styles.orderValue}>{activeTask.orderNumber}</span>
                                    </div>
                                    <div className={styles.orderField}>
                                        <span className={styles.orderLabel}>Product</span>
                                        <span className={styles.orderValue}>{activeTask.productName ?? '—'}</span>
                                    </div>
                                    <div className={styles.orderField}>
                                        <span className={styles.orderLabel}>Operation Step</span>
                                        <span className={styles.orderValue}>
                                            {activeTask.stepName}
                                            {activeTask.totalSteps && (
                                                <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 400 }}>
                                                    (Step {activeTask.stepSequence} of {activeTask.totalSteps})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className={styles.orderField}>
                                        <span className={styles.orderLabel}>Status</span>
                                        <div className={styles.orderStatus}>
                                            <div className={styles.statusDot}></div> In Progress
                                        </div>
                                    </div>
                                </div>

                                {/* Context info row */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem', marginBottom: '0.25rem' }}>
                                    {activeTask.machineCode && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '0.4rem', padding: '0.2rem 0.6rem' }}>
                                            <Cpu size={13} /> {activeTask.machineCode}
                                        </span>
                                    )}
                                    {activeTask.dueDate && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: isOverdue(activeTask.dueDate) ? '#ef4444' : '#94a3b8', background: isOverdue(activeTask.dueDate) ? 'rgba(239,68,68,0.1)' : 'rgba(148,163,184,0.08)', border: `1px solid ${isOverdue(activeTask.dueDate) ? 'rgba(239,68,68,0.3)' : 'rgba(148,163,184,0.15)'}`, borderRadius: '0.4rem', padding: '0.2rem 0.6rem' }}>
                                            <Clock size={13} /> Due {formatDueDate(activeTask.dueDate)}
                                            {isOverdue(activeTask.dueDate) && (
                                                <span style={{ marginLeft: '0.25rem', background: '#ef4444', color: '#fff', fontSize: '0.68rem', fontWeight: 700, borderRadius: '0.25rem', padding: '0.05rem 0.35rem', letterSpacing: '0.04em' }}>OVERDUE</span>
                                            )}
                                        </span>
                                    )}
                                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.8rem', fontWeight: 700, color: getPriorityColor(activeTask.priority ?? 1), background: `${getPriorityColor(activeTask.priority ?? 1)}18`, border: `1px solid ${getPriorityColor(activeTask.priority ?? 1)}40`, borderRadius: '0.4rem', padding: '0.2rem 0.6rem' }}>
                                        {getPriorityLabel(activeTask.priority ?? 1)}
                                    </span>
                                </div>

                                {/* Action buttons — QC PASS is NOT shown here; task must be completed first */}
                                <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.9rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Info size={14} /> QC inspection is done <strong>after</strong> completing this step. Click "Complete Step" first, then a QC inspector will approve via the Quality page.
                                </div>

                                <div className={styles.queueActions} style={{ marginTop: '1.5rem' }}>
                                    <button onClick={() => handleComplete(activeTask.id)} disabled={isPending} className={styles.actionButton}>
                                        {isPending ? 'Saving...' : <><CheckCircle size={20} /> Complete Step</>}
                                    </button>
                                    <button className={`${styles.actionButton} ${styles.secondary}`} onClick={() => setShowQcFail(true)}>
                                        <AlertTriangle size={20} /> Report QC Failure
                                    </button>
                                    <button className={`${styles.actionButton} ${styles.secondary}`} onClick={() => setShowIssue(true)}>
                                        <AlertTriangle size={20} /> Report Downtime
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#7a8fa1', border: '2px dashed #3a4f5f', borderRadius: '1rem' }}>
                                <Workflow size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                                <div>Machine Ready. Select a job from the queue below to begin.</div>
                                <button className={`${styles.actionButton} ${styles.secondary}`}
                                    style={{ marginTop: '1.5rem', display: 'inline-flex' }}
                                    onClick={() => setShowIssue(true)}>
                                    <AlertTriangle size={18} /> Report Downtime
                                </button>
                            </div>
                        )}
                    </section>

                    {/* WORK QUEUE */}
                    <section className={styles.workQueueSection}>
                        <h2 className={styles.sectionTitle}>
                            <ListTodo className={styles.sectionIcon} /> Job Queue
                            <span className={styles.queueCount}>{pendingTasks.length} Pending</span>
                        </h2>

                        <div className={styles.queueList}>
                            {pendingTasks.map((task, index) => {
                                const blocked = !task.canStart;
                                return (
                                    <div key={task.id} className={styles.queueItem}
                                        style={{ opacity: blocked ? 0.72 : 1, borderLeft: blocked ? '3px solid #f59e0b' : undefined }}>
                                        <div className={styles.queueNumber}>#{index + 1}</div>
                                        <div className={styles.queueInfo}>
                                            <div className={styles.queueField}>
                                                <span className={styles.queueFieldLabel}>Order #</span>
                                                <span className={styles.queueFieldValue}>{task.orderNumber}</span>
                                            </div>
                                            {task.productName && (
                                                <div className={styles.queueField}>
                                                    <span className={styles.queueFieldLabel}>Product</span>
                                                    <span className={styles.queueFieldValue}>{task.productName}</span>
                                                </div>
                                            )}
                                            <div className={styles.queueField}>
                                                <span className={styles.queueFieldLabel}>Operation</span>
                                                <span className={styles.queueFieldValue}>
                                                    {task.stepName}
                                                    {task.totalSteps && (
                                                        <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>
                                                            Step {task.stepSequence}/{task.totalSteps}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            {/* Show blocking reason if task is locked */}
                                            {blocked && task.blockingReason && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                                                    <Lock size={12} /> {task.blockingReason}
                                                </div>
                                            )}
                                            {/* Context badges */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                                                {task.machineCode && (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 600, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '0.35rem', padding: '0.1rem 0.45rem' }}>
                                                        <Cpu size={11} /> {task.machineCode}
                                                    </span>
                                                )}
                                                {task.dueDate && (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 600, color: isOverdue(task.dueDate) ? '#ef4444' : '#94a3b8', background: isOverdue(task.dueDate) ? 'rgba(239,68,68,0.1)' : 'rgba(148,163,184,0.07)', border: `1px solid ${isOverdue(task.dueDate) ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.12)'}`, borderRadius: '0.35rem', padding: '0.1rem 0.45rem' }}>
                                                        <Clock size={11} /> {formatDueDate(task.dueDate)}
                                                        {isOverdue(task.dueDate) && (
                                                            <span style={{ marginLeft: '0.2rem', background: '#ef4444', color: '#fff', fontSize: '0.62rem', fontWeight: 700, borderRadius: '0.2rem', padding: '0.02rem 0.3rem', letterSpacing: '0.04em' }}>OVERDUE</span>
                                                        )}
                                                    </span>
                                                )}
                                                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color: getPriorityColor(task.priority ?? 1), background: `${getPriorityColor(task.priority ?? 1)}15`, border: `1px solid ${getPriorityColor(task.priority ?? 1)}35`, borderRadius: '0.35rem', padding: '0.1rem 0.45rem' }}>
                                                    {getPriorityLabel(task.priority ?? 1)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={styles.queueActions}>
                                            <button
                                                onClick={() => !blocked && handleStart(task.id)}
                                                disabled={isPending || !!activeTask || blocked}
                                                className={styles.actionButton}
                                                style={{ minWidth: 'auto', padding: '0.5rem 1.5rem', opacity: (blocked || !!activeTask) ? 0.5 : 1, cursor: blocked ? 'not-allowed' : undefined }}
                                                title={blocked ? task.blockingReason ?? 'Blocked' : 'Start this task'}
                                            >
                                                {blocked ? <Lock size={16} /> : <Play size={18} />}
                                                {blocked ? 'Blocked' : 'Start'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {pendingTasks.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#7a8fa1', border: '2px dashed #3a4f5f', borderRadius: '1rem' }}>
                                    Queue is empty. All tasks complete.
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* RIGHT COLUMN: ORDER AUDIT TRAIL */}
                <div className={styles.eventsSection}>
                    <h3 className={styles.sectionTitle}>
                        <Clock className={styles.sectionIcon} /> Order Activity Log
                        {activeTask && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>{activeTask.orderNumber}</span>}
                    </h3>
                    <div className={styles.eventsList}>
                        {initialActivities.length > 0 ? initialActivities.map(act => (
                            <div key={act.id} className={styles.eventItem}>
                                <div className={styles.eventIcon} style={{ background: `${getActivityColor(act.action)}20`, color: getActivityColor(act.action), borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {act.action === 'TASK_COMPLETED' || act.action === 'STATUS_CHANGE' ? <CheckCircle size={14} /> :
                                     act.action === 'ALERT' ? <AlertTriangle size={14} /> :
                                     act.action === 'QC_RESULT' ? <Info size={14} /> :
                                     <Play size={14} />}
                                </div>
                                <div className={styles.eventContent}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: getActivityColor(act.action) }}>
                                            {getActivityLabel(act.action)}
                                        </span>
                                        <span className={styles.eventTime} style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                            {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {act.performedBy && (
                                        <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                                            by <strong style={{ color: '#cbd5e1' }}>{act.performedBy}</strong>
                                            {act.role && act.role !== 'SYSTEM' && <span style={{ color: '#64748b' }}> ({act.role})</span>}
                                            {act.machine && <span style={{ color: '#60a5fa' }}> · {act.machine}</span>}
                                        </div>
                                    )}
                                    {(act.fromStatus || act.toStatus) && (
                                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.1rem' }}>
                                            {act.fromStatus} → {act.toStatus}
                                        </div>
                                    )}
                                    {act.notes && (
                                        <div className={styles.eventMessage} style={{ marginTop: '0.2rem', fontSize: '0.76rem', color: '#94a3b8' }}>
                                            {act.notes}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div style={{ color: '#7a8fa1', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
                                {activeTask ? 'No activity recorded yet for this order.' : 'Start a job to see the activity log here.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
