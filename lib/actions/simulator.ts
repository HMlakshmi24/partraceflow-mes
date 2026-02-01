'use server';

import { prisma } from '@/lib/services/database';

export async function simulatePLCTick() {
    // 1. Random Machine Fault
    if (Math.random() > 0.95) { // 5% chance per tick
        await prisma.systemEvent.create({
            data: {
                eventType: 'MACHINE_STOP',
                details: 'W21 Spindle Overload Fault (Simulated PLC)',
                // user: 'PLC-W21' // user relation optional
            }
        });
    }

    // 2. Random OEE Fluctuation
    if (Math.random() > 0.8) {
        const oee = 85 + Math.random() * 10; // 85-95%
        // Update a known machine if it exists (e.g., matching a code)
        // await prisma.machine.update(...) 
        // For now, we omit this as we don't have hardcoded machine IDs guaranteed in DB logic yet.
    }

    return { success: true };
}
