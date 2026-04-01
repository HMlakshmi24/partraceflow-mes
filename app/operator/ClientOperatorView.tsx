'use client';

import { startTask, completeTask } from '@/lib/actions/workflow';
import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';
import { CheckCircle, Play, Clock, AlertTriangle, Workflow, ListTodo, X, User } from 'lucide-react';
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

function getShiftLabel(now: Date) {
    const h = now.getHours();
    if (h >= 6 && h < 14) return 'Shift A';
    if (h >= 14 && h < 22) return 'Shift B';
    return 'Shift C';
}

export default function ClientOperatorView({
    initialTasks,
    initialEvents,
    operators,
    machines,
}: {
    initialTasks: any[];
    initialEvents: any[];
    operators: OperatorUser[];
    machines: OperatorMachine[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Active operator selection
    const defaultOperator = operators[0]?.username ?? 'operator';
    const [activeOperator, setActiveOperator] = useState(defaultOperator);

    // Report Issue modal state
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
        setTimeout(() => setToast(null), 3500);
    };

    const handleStart = async (taskId: string) => {
        startTransition(async () => {
            const result = await startTask(taskId, activeOperator);
            if (!result.success) {
                showToast(`Failed to start: ${result.msg}`, false);
            } else {
                showToast('Task started!', true);
            }
            router.refresh();
        });
    };

    const handleComplete = async (taskId: string) => {
        startTransition(async () => {
            const result = await completeTask(taskId, activeOperator);
            if (!result.success) {
                showToast(`Failed to complete: ${result.msg}`, false);
            } else {
                showToast('Step completed!', true);
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

    const submitQuality = async (result: 'PASS' | 'FAIL') => {
        if (!activeTask) return;
        setQcSubmitting(true);
        try {
            const actual = result === 'PASS' ? 'PASS' : qcDefect;
            const res = await fetch('/api/quality', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'task_qc',
                    taskId: activeTask.id,
                    parameter: qcParam,
                    expected: 'PASS',
                    actual,
                    result,
                    notes: qcNotes,
                })
            });
            if (res.ok) {
                showToast(`Quality ${result} recorded`, true);
                setShowQcFail(false);
                setQcNotes('');
                router.refresh();
            } else {
                showToast('Failed to record quality', false);
            }
        } catch {
            showToast('Network error', false);
        } finally {
            setQcSubmitting(false);
        }
    };

    // Group tasks
    const activeTask = initialTasks.find(t => t.status === 'IN_PROGRESS');
    const pendingTasks = initialTasks.filter(t => t.status === 'PENDING');
    const completedTasks = initialTasks.filter(t => t.status === 'COMPLETED');

    return (
        <>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000,
                    padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600, color: '#fff',
                    background: toast.ok ? '#10b981' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
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
                                <select
                                    value={issueMachine}
                                    onChange={e => setIssueMachine(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                >
                                    {machines.length === 0 && <option value="">— No machines found —</option>}
                                    {machines.map(m => (
                                        <option key={m.id} value={m.id}>{m.code} – {m.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Downtime Reason</label>
                                <select
                                    value={issueReason}
                                    onChange={e => setIssueReason(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                >
                                    {DOWNTIME_REASONS.map(r => <option key={r}>{r}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Notes (optional)</label>
                                <textarea
                                    value={issueNotes}
                                    onChange={e => setIssueNotes(e.target.value)}
                                    placeholder="Describe the issue in detail..."
                                    rows={3}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button
                                    onClick={() => setShowIssue(false)}
                                    style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReportIssue}
                                    disabled={issueSubmitting}
                                    style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
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
                                <AlertTriangle size={20} color="#ef4444" /> QC Failure
                            </h2>
                            <button onClick={() => setShowQcFail(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                                <X size={22} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Defect Type</label>
                                <select
                                    value={qcDefect}
                                    onChange={e => setQcDefect(e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                                >
                                    {['Dimensional Error', 'Surface Defect', 'Bad Weld', 'Discoloration', 'Crack/Fracture', 'Wrong Part', 'Other'].map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>Notes (optional)</label>
                                <textarea
                                    value={qcNotes}
                                    onChange={e => setQcNotes(e.target.value)}
                                    placeholder="Add failure details…"
                                    rows={3}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button
                                    onClick={() => setShowQcFail(false)}
                                    style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--foreground)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => submitQuality('FAIL')}
                                    disabled={qcSubmitting}
                                    style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <AlertTriangle size={16} /> {qcSubmitting ? 'Submitting...' : 'Record FAIL'}
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
                    <select
                        value={activeOperator}
                        onChange={e => setActiveOperator(e.target.value)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '0.4rem', border: '1px solid rgba(255,255,255,0.15)', background: '#1e2d3d', color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        {operators.map(op => (
                            <option key={op.id} value={op.username}>{op.username} ({op.role})</option>
                        ))}
                    </select>
                ) : (
                    <span style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 600 }}>operator</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b' }}>Seed demo data in Settings to populate operators</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '2rem', height: 'calc(100vh - 170px)' }}>

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
                                        <span className={styles.orderLabel}>Operation Step</span>
                                        <span className={styles.orderValue}>{activeTask.stepName}</span>
                                    </div>
                                    <div className={styles.orderField}>
                                        <span className={styles.orderLabel}>Status</span>
                                        <div className={styles.orderStatus}>
                                            <div className={styles.statusDot}></div> In Progress
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.progressContainer}>
                                    <div className={styles.progressLabel}>
                                        <span>Time Elapsed: 00:45:12</span>
                                        <span className={styles.progressPercent}>75%</span>
                                    </div>
                                    <div className={styles.progressBar}>
                                        <div className={styles.progressFill} style={{ width: '75%' }}>Processing</div>
                                    </div>
                                </div>

                                <div className={styles.queueActions} style={{ marginTop: '2rem' }}>
                                    <button
                                        onClick={() => handleComplete(activeTask.id)}
                                        disabled={isPending}
                                        className={styles.actionButton}
                                    >
                                        {isPending ? 'Saving...' : <><CheckCircle size={20} /> Complete Step</>}
                                    </button>
                                    <button
                                        className={styles.actionButton}
                                        style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}
                                        onClick={() => submitQuality('PASS')}
                                        disabled={qcSubmitting}
                                    >
                                        <CheckCircle size={20} /> {qcSubmitting ? 'Saving...' : 'QC Pass'}
                                    </button>
                                    <button
                                        className={`${styles.actionButton} ${styles.secondary}`}
                                        onClick={() => setShowQcFail(true)}
                                    >
                                        <AlertTriangle size={20} /> QC Fail
                                    </button>
                                    <button
                                        className={`${styles.actionButton} ${styles.secondary}`}
                                        onClick={() => setShowIssue(true)}
                                    >
                                        <AlertTriangle size={20} /> Report Issue
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#7a8fa1', border: '2px dashed #3a4f5f', borderRadius: '1rem' }}>
                                <Workflow size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                                <div>Machine Ready. Select a job from the queue to receive instructions.</div>
                                <button
                                    className={`${styles.actionButton} ${styles.secondary}`}
                                    style={{ marginTop: '1.5rem', display: 'inline-flex' }}
                                    onClick={() => setShowIssue(true)}
                                >
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
                            {pendingTasks.map((task, index) => (
                                <div key={task.id} className={styles.queueItem}>
                                    <div className={styles.queueNumber}>#{index + 1}</div>
                                    <div className={styles.queueInfo}>
                                        <div className={styles.queueField}>
                                            <span className={styles.queueFieldLabel}>Order #</span>
                                            <span className={styles.queueFieldValue}>{task.orderNumber}</span>
                                        </div>
                                        <div className={styles.queueField}>
                                            <span className={styles.queueFieldLabel}>Operation</span>
                                            <span className={styles.queueFieldValue}>{task.stepName}</span>
                                        </div>
                                    </div>
                                    <div className={styles.queueActions}>
                                        <button
                                            onClick={() => handleStart(task.id)}
                                            disabled={isPending || !!activeTask}
                                            className={styles.actionButton}
                                            style={{ minWidth: 'auto', padding: '0.5rem 1.5rem' }}
                                        >
                                            <Play size={18} /> Start
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {pendingTasks.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#7a8fa1', border: '2px dashed #3a4f5f', borderRadius: '1rem' }}>
                                    Queue is empty. All tasks complete.
                                </div>
                            )}
                        </div>

                        {/* Completed tasks summary */}
                        {completedTasks.length > 0 && (
                            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '0.5rem', fontSize: '0.85rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckCircle size={16} /> {completedTasks.length} task{completedTasks.length > 1 ? 's' : ''} completed this session
                            </div>
                        )}
                    </section>
                </div>

                {/* RIGHT COLUMN: EVENTS & LOGS */}
                <div className={styles.eventsSection}>
                    <h3 className={styles.sectionTitle}>
                        <Clock className={styles.sectionIcon} /> Station Log
                    </h3>
                    <div className={styles.eventsList}>
                        {initialEvents.map(event => (
                            <div key={event.id} className={styles.eventItem}>
                                <div className={`${styles.eventIcon} ${event.type === 'Info' ? styles.ok : styles.warning}`}>
                                    {event.eventType === 'DOWNTIME_START' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                                </div>
                                <div className={styles.eventContent}>
                                    <div className={styles.eventTime}>
                                        {new Date(event.timestamp).toLocaleTimeString()}
                                    </div>
                                    <div className={styles.eventMessage}>{event.details}</div>
                                </div>
                            </div>
                        ))}
                        {initialEvents.length === 0 && (
                            <div style={{ color: '#7a8fa1', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>No events yet.</div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
