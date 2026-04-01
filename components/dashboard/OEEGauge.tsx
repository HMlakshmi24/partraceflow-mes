'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import styles from './OEEGauge.module.css';

interface OEEGaugeProps {
    value: number;
    label: string;
    color: string;
}

export default function OEEGauge({ value, label, color }: OEEGaugeProps) {
    const data = [
        { name: 'Value', value: value },
        { name: 'Rest', value: 100 - value },
    ];

    const emptyColor = '#e0e0e0';

    return (
        <div className={styles.container}>
            <div className={styles.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="70%"
                            innerRadius={30}
                            outerRadius={45}
                            startAngle={180}
                            endAngle={0}
                            paddingAngle={0}
                            dataKey="value"
                            stroke="none"
                            cornerRadius={5}
                        >
                            <Cell key="cell-value" fill={color} />
                            <Cell key="cell-rest" fill={emptyColor} />
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className={styles.labelValue}>{Number(value).toFixed(1)}%</div>
            </div>
            <div className={styles.labelText}>{label}</div>
        </div>
    );
}
