# ParTraceflow MES — Quick Command Reference
**TL;DR for busy people** | Updated Feb 14, 2026

---

## 🚀 Get Running (60 seconds)

```bash
cd f:/MES/mes-app

# First time only
npm install
npx prisma db push --accept-data-loss
npx prisma db seed

# Start dev server
npm run dev
```

**Then open**: http://localhost:3000

---

## 📍 Key URLs

| Page | URL |
|------|-----|
| Home | http://localhost:3000 |
| Marketing Brochure | http://localhost:3000/brochure |
| Dashboard | http://localhost:3000/dashboard |
| Production Planner | http://localhost:3000/planner |
| Operator Console | http://localhost:3000/operator |
| Quality Control | http://localhost:3000/quality |
| Workflow Designer | http://localhost:3000/workflows/designer |

---

## 🧪 Run Tests

```bash
# Quick page check
npx ts-node verify_all.ts

# API endpoints
npm run test:smoke

# Full workflow lifecycle
npm run test:e2e

# All tests
npm run test:all

# Simulate RFID event
npx ts-node scripts/simulate_rfid.ts
```

---

## 🔗 API Endpoints (for integration)

```bash
# Fetch products & orders
curl http://localhost:3000/api/orders

# Save workflow
curl -X POST http://localhost:3000/api/designer \
  -H "Content-Type: application/json" \
  -d '{"name":"My Workflow","payload":{...}}'

# Start workflow instance
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{"definitionId":"<id>","orderId":"<id>"}'

# Post event (RFID, PLC, etc.)
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"source":"rfid-reader-01","eventType":"RFID_READ","details":{"tagId":"ABC123"}}'
```

---

## 📊 Database

```bash
# View database directly
sqlite3 prisma/dev.db

# Get all tables
.tables

# Reset database
npx prisma db push --accept-data-loss
npx prisma db seed
```

---

## 📝 Project Structure

```
f:/MES/mes-app/
├── app/                    ← Pages & API routes
│   ├── dashboard/
│   ├── planner/
│   ├── operator/
│   ├── quality/
│   ├── workflows/designer/
│   └── api/                ← REST endpoints
├── components/             ← React components
│   └── WorkflowDesigner.tsx
├── lib/                    ← Business logic
│   ├── engines/            ← WorkflowEngine
│   ├── services/           ← AuditService, database
│   ├── connectors/         ← ERP, PLC, MQTT, RFID
│   └── actions/            ← Server actions
├── prisma/
│   ├── schema.prisma       ← Data models
│   ├── seed.ts             ← Initialize DB
│   └── dev.db              ← SQLite database
├── scripts/                ← Test & utility scripts
│   ├── smoke_test.ts
│   ├── end_to_end_test.ts
│   ├── simulate_rfid.ts
│   └── mqtt_bridge.js
└── docs/                   ← Guides & docs
    ├── README.md
    ├── DEV_GUIDE.md
    ├── HARDWARE_INTEGRATION.md
    ├── PRODUCTION_READINESS.md
    └── COMPLETION_CHECKLIST.md
```

---

## 🔧 Common Tasks

### Add a new page
```bash
# Create page file
mkdir -p app/mypage
cat > app/mypage/page.tsx << 'EOF'
export default function Page() {
  return <h1>My Page</h1>;
}
EOF

# Update sidebar in app/layout.tsx to link it
```

### Add API endpoint
```bash
# Create route handler
cat > app/api/myroute/route.ts << 'EOF'
export async function GET(request: Request) {
  return Response.json({ message: "Hello" });
}
EOF

# Call it: GET http://localhost:3000/api/myroute
```

### Debug workflow execution
```bash
# Check audit logs
curl http://localhost:3000/api/events?type=WORKFLOW_START

# View database records
sqlite3 prisma/dev.db "SELECT * FROM SystemEvent ORDER BY createdAt DESC LIMIT 10;"
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3000 in use | `npx kill-port 3000` then `npm run dev` |
| DB out of sync | `npx prisma db push --accept-data-loss` |
| Missing data | `npx prisma db seed` |
| Module not found | `npm install` and clear `.next/` folder |
| Slow build | Restart dev server: `Ctrl+C` then `npm run dev` |

---

## 🚢 Deploy to Production (Basics)

```bash
# Build
npm run build

# Start server
npm start

# Or use Docker
docker build -t mes-app .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://..." mes-app
```

**Note**: Add authentication, env vars, and secrets vault before production use.

---

## 📞 Need Help?

1. **Dev questions**: See [DEV_GUIDE.md](DEV_GUIDE.md)
2. **Hardware setup**: See [HARDWARE_INTEGRATION.md](HARDWARE_INTEGRATION.md)
3. **Production checklist**: See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)
4. **Full build summary**: See [COMPLETION_CHECKLIST.md](COMPLETION_CHECKLIST.md)

---

## ✅ System Status Check

```bash
# All at once
npm install && \
npx prisma db push --accept-data-loss && \
npx prisma db seed && \
npm run dev &
npx ts-node verify_all.ts && \
npm run test:all
```

Expected output:
```
✅ All 6 pages accessible (verify_all.ts)
✅ API endpoints responding (test:smoke)
✅ Full workflow working (test:e2e)
```

---

**Quick Stats**:
- **Build time**: ~5 min (first time) / <30 sec (rebuild)
- **Test time**: ~30 sec (all tests)
- **DB size**: ~2 MB (SQLite dev)
- **Bundle size**: ~300 KB gzipped (Next.js)
- **Node version**: 18+ recommended
- **Package count**: ~150 npm packages

**Ready to ship! 🚀**

