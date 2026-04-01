// Simple RFID simulator that posts a read to /api/events
// Run with: npx ts-node scripts/simulate_rfid.ts

async function run() {
    const base = 'http://localhost:3000';
    const tag = 'SIM-' + Math.floor(Math.random() * 100000);
    const res = await fetch(base + '/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'simulator', eventType: 'RFID_READ', details: { tag } }),
    });

    console.log('Simulator response:', await res.text());
}

run().catch(e => { console.error(e); process.exit(1); });
