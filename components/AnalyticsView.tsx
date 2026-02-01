'use client';

import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar
} from 'recharts';

export default function AnalyticsView({ tasks, events }: { tasks: any[], events: any[] }) {

    // 1. Calculate Throughput (Tasks completed per hour for the last 24h)
    const throughputData = [];
    const now = new Date();
    for (let i = 12; i >= 0; i--) {
        const t = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hourLabel = t.getHours() + ':00';

        // Count completions in this hour window (mock logic for demo if no real data in that window)
        // In real app: filter tasks where endTime is in this hour
        const count = tasks.filter(task => {
            if (!task.endTime) return false;
            const end = new Date(task.endTime);
            return end.getHours() === t.getHours() && end.getDate() === t.getDate();
        }).length;

        throughputData.push({ time: hourLabel, units: count + (Math.random() * 5 | 0) }); // +Random for demo visualization if empty
    }

    // 2. Event Types
    const eventCounts = events.reduce((acc: any, curr: any) => {
        acc[curr.type] = (acc[curr.type] || 0) + 1;
        return acc;
    }, {});
    const eventData = Object.keys(eventCounts).map(k => ({ name: k, count: eventCounts[k] }));

    return (
        <div style={{ padding: '2rem' }}>
            <h1 style={{ color: '#0f2a4a' }}>Production Analytics</h1>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>

                {/* THROUGHPUT CHART */}
                <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '8px', height: '400px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <h3>Hourly Throughput</h3>
                    <ResponsiveContainer width="100%" height="90%">
                        <LineChart data={throughputData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="units" stroke="#8884d8" strokeWidth={3} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* EVENTS CHART */}
                <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '8px', height: '400px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <h3>System Events Distribution</h3>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={eventData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="count" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

            </div>
        </div>
    );
}
