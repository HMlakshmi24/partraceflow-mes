'use client';

import styles from './Dashboard.module.css';
import OEEGauge from '@/components/dashboard/OEEGauge';
import ParetoChart from '@/components/dashboard/ParetoChart';
import HourByHourChart from '@/components/dashboard/HourByHourChart';
import WorkCenterTable from '@/components/dashboard/WorkCenterTable';
import StopsCounter from '@/components/dashboard/StopsCounter';
import { getDashboardData } from '@/lib/mockData';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DashboardContent() {
    const searchParams = useSearchParams();
    const period = searchParams.get('period') || 'day';

    const data = getDashboardData(period);

    return (
        <div className={styles.dashboard}>

            {/* KPI Row */}
            <div className={styles.kpiRow}>
                <div className={styles.kpiCard}>
                    <OEEGauge value={data.oee.oee} label="OEE" color="#d32f2f" />
                </div>
                <div className={styles.kpiCard}>
                    <OEEGauge value={data.oee.availability} label="Availability" color="#fbc02d" />
                </div>
                <div className={styles.kpiCard}>
                    <OEEGauge value={data.oee.performance} label="Performance" color="#fbc02d" />
                </div>
                <div className={styles.kpiCard}>
                    <OEEGauge value={data.oee.quality} label="Quality" color="#388e3c" />
                </div>
                <div className={styles.kpiCard}>
                    <StopsCounter count={data.oee.stops} />
                </div>
            </div>

            {/* Main Content Grid */}
            <div className={styles.mainGrid}>

                {/* Left Column: Paretos */}
                <div className={styles.leftCol}>
                    <div className={styles.chartCard} style={{ flex: 1 }}>
                        <ParetoChart title="Downtime Pareto" data={data.downtime} />
                    </div>
                    <div className={styles.chartCard} style={{ flex: 1, marginTop: '1rem' }}>
                        {/* Reusing Pareto for Scrap as seen in screenshot logic */}
                        <ParetoChart title="Scrap Pareto" data={data.scrap} />
                    </div>
                </div>

                {/* Right Column: Work Center & Timeline */}
                <div className={styles.rightCol}>
                    <div className={styles.tableCard}>
                        <WorkCenterTable machines={data.machines} />
                    </div>
                    <div className={styles.timelineCard}>
                        <HourByHourChart data={data.production} />
                    </div>
                </div>

            </div>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div>Loading dashboard...</div>}>
            <DashboardContent />
        </Suspense>
    );
}
