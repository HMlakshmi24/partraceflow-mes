'use client';

import { useEffect } from 'react';
import { simulatePLCTick } from '@/lib/actions/simulator';

export default function PLCConnection() {
    useEffect(() => {
        const interval = setInterval(async () => {
            await simulatePLCTick();
            // Optional: Trigger a router refresh to show new data?
            // router.refresh(); 
            // Doing a full refresh every 5s is too heavy for UI, better to let React Query or similar handle it.
            // For this demo, we just want the data generation to happen.
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    return null; // Invisible
}
