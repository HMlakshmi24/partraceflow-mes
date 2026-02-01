'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import styles from './HourByHourChart.module.css';
import { HourlyProduction } from '@/lib/types';

interface HourByHourChartProps {
    data: HourlyProduction[];
}

export default function HourByHourChart({ data }: HourByHourChartProps) {
    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Hour by Hour</h3>
            <div className={styles.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="target" stroke="#e0e0e0" strokeDasharray="5 5" name="Target" dot={false} />
                        <Line type="monotone" dataKey="actual" stroke="#388e3c" strokeWidth={2} name="Actual" />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
