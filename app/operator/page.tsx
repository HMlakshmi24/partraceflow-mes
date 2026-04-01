import ClientOperatorView from './ClientOperatorView';
import styles from './operator.module.css';
import { HardHat } from 'lucide-react';
import { getOperatorTasks, getSystemEvents, getOperatorUsers, getMachinesForOperator } from '@/lib/actions/workflow';

export default async function OperatorPage() {
    const results = await Promise.allSettled([
        getOperatorTasks(),
        getSystemEvents(),
        getOperatorUsers(),
        getMachinesForOperator(),
    ]);
    const [tasks, events, operators, machines] = results.map(r =>
        r.status === 'fulfilled' ? r.value : []
    ) as [Awaited<ReturnType<typeof getOperatorTasks>>, Awaited<ReturnType<typeof getSystemEvents>>, Awaited<ReturnType<typeof getOperatorUsers>>, Awaited<ReturnType<typeof getMachinesForOperator>>];

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
                initialEvents={events}
                operators={operators}
                machines={machines}
            />
        </div>
    );
}
