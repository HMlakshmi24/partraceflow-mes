import styles from './StopsCounter.module.css';

interface StopsCounterProps {
    count: number;
}

export default function StopsCounter({ count }: StopsCounterProps) {
    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Stops</h3>
            <div className={styles.value}>{count}</div>
            <div className={styles.flag}>🚩</div>
        </div>
    );
}
