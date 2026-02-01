import { getOperatorTasks, getSystemEvents } from '@/lib/actions/workflow';
import ClientOperatorView from './ClientOperatorView';
import styles from './operator.module.css';
import { HardHat } from 'lucide-react';

export default async function OperatorPage() {
    const tasks = await getOperatorTasks();
    const events = await getSystemEvents();

    return (
        <div className={styles.operatorWorkspace}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <HardHat className={styles.headerIcon} />
                    ParTraceflow MES - Operator Terminal
                </div>
                <div className={styles.operatorInfo}>
                    <span>Station: <span className={styles.operatorName}>W21-Assembly</span></span>
                    <span className="status-badge success">Online</span>
                </div>
            </header>

            <ClientOperatorView initialTasks={tasks} initialEvents={events} />
        </div>
    );
}
