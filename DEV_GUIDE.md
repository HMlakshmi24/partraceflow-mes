# Developer Quick Start & Smoke Tests

These instructions get a developer up-and-running and show how to run the smoke tests and hardware simulator.

Prereqs
- Node.js 18+
- npm

Setup
```powershell
cd f:/MES/mes-app
npm install
cp .env.example .env   # if you have an example; this project already uses .env for SQLite
npx prisma generate
npx prisma db push --accept-data-loss
npx prisma db seed
npm run dev
```

Smoke tests
```powershell
# In a separate terminal while dev server is running
npx ts-node scripts/smoke_test.ts
```

Simulate hardware
```powershell
npx ts-node scripts/simulate_rfid.ts
```

MQTT Bridge (demo)
```powershell
# Start a local mosquitto broker (or use your broker)
# Then run the bridge that forwards MQTT messages to MES /api/events
node scripts/mqtt_bridge.js mqtt://localhost:1883
```


Where to look
- App runs on http://localhost:3000
- Brochure: /brochure
- Workflow Designer: /workflows/designer

Notes
- Connector stubs live in `lib/connectors` — replace with real gateway integrations for production.
