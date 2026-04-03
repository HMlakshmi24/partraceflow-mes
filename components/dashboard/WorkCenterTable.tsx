import styles from './WorkCenterTable.module.css';
import { MachineStatus } from '@/lib/types';
import clsx from 'clsx';

interface WorkCenterTableProps {
    machines: MachineStatus[];
}

export default function WorkCenterTable({ machines }: WorkCenterTableProps) {
    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Machine Performance</h3>
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Machine</th>
                            <th>Running State</th>
                            <th>Overall Efficiency</th>
                            <th>Available Time</th>
                            <th>Running Speed</th>
                            <th>Good Quality</th>
                            <th className={styles.alignRight}>Good Parts</th>
                            <th className={styles.alignRight}>Rejected Parts</th>
                        </tr>
                    </thead>
                    <tbody>
                        {machines.map((machine) => (
                            <tr key={machine.id}>
                                <td>{machine.name}</td>
                                <td>{getStateLabel(machine.status)}</td>
                                <td><StatusDot value={machine.oee} status={machine.status} /> {machine.oee}%</td>
                                <td><StatusDot value={machine.availability} status={machine.status} /> {machine.availability}%</td>
                                <td><StatusDot value={machine.performance} status={machine.status} /> {machine.performance}%</td>
                                <td><StatusDot value={machine.quality} status={machine.status} /> {machine.quality}%</td>
                                <td className={styles.alignRight}>
                                    {machine.goodQuantity > 0 &&
                                        <div className={styles.goodBar} style={{ width: `${Math.min(machine.goodQuantity / 2, 100)}px` }}></div>
                                    }
                                    {machine.goodQuantity}
                                </td>
                                <td className={styles.alignRight}>
                                    {machine.scrapQuantity > 0 &&
                                        <span className={styles.scrapBadge}>{machine.scrapQuantity}</span>
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function getStateLabel(status: MachineStatus['status']) {
    if (status === 'running') return 'Running';
    if (status === 'down') return 'Stopped';
    if (status === 'warning') return 'Maintenance';
    return 'Idle';
}

function StatusDot({ value, status }: { value: number; status: string }) {
    let colorClass = styles.dotGrey;
    if (value >= 85) colorClass = styles.dotGreen;
    else if (value >= 50) colorClass = styles.dotYellow;
    else if (value > 0) colorClass = styles.dotRed;

    // Override based on machine status if stopped
    if (status === 'stopped') colorClass = styles.dotGrey;

    return <span className={clsx(styles.dot, colorClass)}></span>;
}
