import ClientOperatorView from './ClientOperatorView';
import styles from './operator.module.css';
import { HardHat } from 'lucide-react';
import { getOperatorTasks, getOperatorUsers, getMachinesForOperator, getOrderActivities } from '@/lib/actions/workflow';

export default async function OperatorPage() {
    const results = await Promise.allSettled([
        getOperatorTasks(),
        getOperatorUsers(),
        getMachinesForOperator(),
    ]);
    const [tasks, operators, machines] = results.map(r =>
        r.status === 'fulfilled' ? r.value : []
    ) as [Awaited<ReturnType<typeof getOperatorTasks>>, Awaited<ReturnType<typeof getOperatorUsers>>, Awaited<ReturnType<typeof getMachinesForOperator>>];

    // Fetch rich audit trail for the active order so the Station Log shows who did what and when
    const activeTask = tasks.find((t: { status: string }) => t.status === 'IN_PROGRESS') as { orderId?: string } | undefined;
    const activities = activeTask?.orderId
        ? await getOrderActivities(activeTask.orderId).catch(() => [])
        : [];

    return (
        <div className={styles.operatorWorkspace}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <HardHat className={styles.headerIcon} />
                    ParTraceflow MES - Operator Terminal
                </div>
                <div className={styles.operatorInfo}>
                    <span className="status-badge success">Online</span>
                </div>
            </header>

            <ClientOperatorView
                initialTasks={tasks}
                initialActivities={activities}
                operators={operators}
                machines={machines}
            />
        </div>
    );
}
