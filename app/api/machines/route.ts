import { NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';

export async function GET() {
    // Aggregate status from tasks
    // If a machine has an IN_PROGRESS task, it's RUNNING
    // If we have a 'MACHINE_STOP' event for it recently, it's DOWN
    // Otherwise IDLE

    const machines = [
        { id: 'W21', name: 'Assembly Station A', dept: 'Assembly' },
        { id: 'TEST-01', name: 'Torque Tester', dept: 'Quality' },
        { id: 'PACK-01', name: 'Packaging Unit', dept: 'Logistics' }
    ];

    const result = machines.map(m => {
        const activeTask = null; // TODO: Get from prisma
        const recentStop = null; // TODO: Get from prisma

        let status = 'IDLE';
        if (recentStop) status = 'DOWN';
        else if (activeTask) status = 'RUNNING';

        return {
            ...m,
            status,
            currentJob: null // TODO: Get from prisma
        };
    });

    return NextResponse.json(result);
}
