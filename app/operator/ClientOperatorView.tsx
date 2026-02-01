'use client';

import { startTask, completeTask } from '@/lib/actions/workflow';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { CheckCircle, Play, Clock, AlertTriangle, Workflow, ListTodo } from 'lucide-react';
import styles from './operator.module.css';

export default function ClientOperatorView({ initialTasks, initialEvents }: { initialTasks: any[], initialEvents: any[] }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleStart = async (taskId: string) => {
        startTransition(async () => {
            await startTask(taskId, 'OP-JOHN');
            router.refresh();
        });
    };

    const handleComplete = async (taskId: string) => {
        startTransition(async () => {
            await completeTask(taskId, 'OP-JOHN');
            router.refresh();
        });
    };

    // Group tasks
    const activeTask = initialTasks.find(t => t.status === 'IN_PROGRESS');
    const pendingTasks = initialTasks.filter(t => t.status === 'PENDING');
    const completedTasks = initialTasks.filter(t => t.status === 'COMPLETED');

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '2rem', height: 'calc(100vh - 120px)' }}>

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
                                <button className={`${styles.actionButton} ${styles.secondary}`}>
                                    <AlertTriangle size={20} /> Report Issue
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#7a8fa1', border: '2px dashed #3a4f5f', borderRadius: '1rem' }}>
                            <Workflow size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                            <div>Machine Ready. Select a job from the queue to receive instructions.</div>
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
                        {pendingTasks.length === 0 && <div className="text-gray-500 italic">Queue is empty.</div>}
                    </div>
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
                                {event.type === 'Info' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                            </div>
                            <div className={styles.eventContent}>
                                <div className={styles.eventTime}>
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                </div>
                                <div className={styles.eventMessage}>{event.details}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
