'use client';

import { useEffect, useState } from 'react';
import ClientOperatorView from './ClientOperatorView';
import styles from './operator.module.css';
import { HardHat } from 'lucide-react';

export default function OperatorPage() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);

    useEffect(() => {
        // Load data asynchronously
        setTasks([]);
        setEvents([]);
    }, []);

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
