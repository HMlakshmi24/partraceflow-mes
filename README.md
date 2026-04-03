# ParTraceflow MES

**Manufacturing Execution System** for industrial pipe spool fabrication, shop floor operations, quality control, and traceability — built with Next.js 16, React 19, Prisma ORM, and SQLite.

---

## What Is This?

ParTraceflow MES is a full-stack web application that digitises and manages everything that happens on a manufacturing shop floor — from work orders and machine monitoring to pipe spool welding, NDE inspection, pressure testing, and final sign-off approvals.

It was built for a **pipe fabrication facility** but the core MES modules (production, quality, traceability, OEE) are general-purpose.

---

## Modules

| Module | What It Does |
|---|---|
| **Supervisor Dashboard** | Live OEE, active stops, alerts, production KPIs |
| **Shop Floor Operator** | Operator terminal — job queue, start/stop operations, log downtime |
| **Pipe Spool System** | Full spool lifecycle: fabrication to welding to NDE to pressure test to handover |
| **Quality & Process** | Inspection records, SPC charts, quality gates, NCR management |
| **ERP Planner** | Work orders, scheduling, routing |
| **Shift Management** | Shift handover, shift reports, attendance |
| **Factory Map** | Live machine layout with status indicators |
| **Workflows** | Configurable approval workflows with BPMN-style routing |
| **Traceability** | Full lot/batch/serial number genealogy |
| **RFID Integration** | Hardware-agnostic tag ingestion, reader health monitoring |
| **Andon** | Live alert board — escalations, downtime triggers |
| **MES Copilot** | AI assistant for shop floor queries |

---

## Pipe Spool System — State Flow

Every spool moves through a strict state machine enforced at the API level:

```
FABRICATING -> RECEIVED -> IN_STORAGE -> ISSUED -> FIT_UP
    -> WELDED -> NDE_PENDING -> NDE_CLEAR -> PRESSURE_TESTED -> COMPLETE
```

Key features:
- **Weld records** — welder ID, WPS reference, repair count
- **NDE records** — RT, UT, MT, PT with ACCEPT / REJECT / HOLD logic
- **Pressure test records** — test certificates, witness sign-off
- **NCR (Non-Conformance Report)** — auto-generated NCR numbers, severity levels, corrective actions
- **Spool Passport** — full history page per spool: joints, welds, inspections, NCRs, approvals, documents
- **ITP (Inspection & Test Plan)** — checklist templates linked to spool inspections
- **Revision Guard** — blocks work on SUPERSEDED drawings; warns on IFR drawings
- **Action-Level RBAC** — role-based permission per API action
- **Document Upload** — multipart file upload linked to spool / joint / NCR / NDE records
- **RFID Gateway** — any reader pushes `POST /api/rfid/ingest`; system deduplicates and auto-advances spool status by reader location

---

## Role-Based Access Control (RBAC)

| Role | What They Can Do |
|---|---|
| `OPERATOR` | Create welds, update joint status, upload documents |
| `QC` | Create NDE, inspections, raise NCR, create pressure tests |
| `QUALITY` | Approve/reject NDE, close NCR, approve spools, release HOLD |
| `SUPERVISOR` | Everything above + override HOLD, override SUPERSEDED revision |
| `ADMIN` | Full access including delete and bulk import |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS, Recharts, Lucide Icons |
| Database | SQLite (dev) via Prisma ORM — swap to PostgreSQL for production |
| Validation | Zod (all API routes validated) |
| Auth | Cookie-based session tokens (no external auth service needed) |
| RFID | HTTP ingestion endpoint — hardware-agnostic |
| Charts | Recharts (OEE trend, Pareto, SPC) |

---

## Prerequisites

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **npm** v9 or later (comes with Node.js)
- No Docker, no external database, no cloud account needed for development

Check your versions:

```bash
node --version   # should be 18+
npm --version    # should be 9+
```

---

## Getting Started

### 1. Clone or Download

```bash
git clone https://github.com/your-org/partraceflow-mes.git
cd partraceflow-mes/mes-app
```

Or if you already have the folder, open a terminal inside `mes-app/`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment

Create a `.env` file in the `mes-app/` folder:

```env
DATABASE_URL="file:./prisma/dev.db"
SESSION_SECRET="replace-this-with-a-64-char-random-string"
```

Generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Set Up the Database

```bash
npx prisma migrate dev --name init
```

This creates `prisma/dev.db` (SQLite file) and applies all schema migrations.

### 5. Seed Demo Data

```bash
node seed-db.js
```

This creates demo users, machines, work orders, pipe spools, and sample records so you can explore the system immediately.

### 6. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Default Login Credentials

After seeding, use any of these accounts:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Administrator |
| `SUPV-LEE` | `demo` | Supervisor |
| `QC-SARAH` | `demo` | Quality Inspector |
| `OP-JOHN` | `demo` | Operator |
| `OP-MARIA` | `demo` | Operator |

---

## Project Structure

```
mes-app/
├── app/                        # Next.js App Router pages and API routes
│   ├── api/                    # REST API endpoints
│   │   ├── pipe-spool/         # Spool, joints, welds, NDE, NCR, approvals
│   │   ├── rfid/               # RFID ingestion and reader health
│   │   ├── dashboard/          # Live KPIs and OEE
│   │   └── ...
│   ├── dashboard/              # Supervisor dashboard page
│   ├── operator/               # Shop floor operator terminal
│   ├── pipe-spool/             # Pipe spool management pages
│   │   └── spools/[id]/        # Spool Passport (full history per spool)
│   ├── quality/                # Quality and SPC pages
│   └── ...
├── lib/                        # Shared business logic
│   ├── spoolFlow.ts            # State machine — enforces spool transitions
│   ├── spoolTransitions.ts     # Allowed state transition map
│   ├── spoolRBAC.ts            # Action-level RBAC permission matrix
│   ├── revisionGuard.ts        # Drawing revision control
│   ├── validation.ts           # Zod schemas for all API inputs
│   ├── auth.ts                 # Session token creation and verification
│   └── services/               # AuditService, OEEService, ShiftService, etc.
├── prisma/
│   ├── schema.prisma           # 92-model database schema
│   └── dev.db                  # SQLite database (created on first migrate)
├── components/                 # Shared React components
└── public/
    └── uploads/spool-docs/     # Uploaded spool documents (gitignored)
```

---

## Available Scripts

```bash
npm run dev        # Start development server with hot reload
npm run build      # Build for production
npm run start      # Start production server (run build first)
npm run lint       # Run ESLint
npm run demo       # Run factory simulation (generates live dummy data)
```

---

## RFID Integration

Any RFID reader or gateway can push tag reads to the MES over HTTP — no vendor lock-in:

```bash
POST /api/rfid/ingest
Content-Type: application/json

{
  "tagId": "E200001234567890",
  "readerId": "GATE_RECV",
  "readerName": "Yard Entrance Gate",
  "location": "Yard Entrance",
  "rssi": -62
}
```

The system:
1. Deduplicates reads (same reader + tag within 3 seconds is ignored)
2. Resolves the tag to a spool or joint in the database
3. Auto-advances spool status based on reader location (e.g. "Yard Entrance" moves spool to `RECEIVED`)
4. Returns the resolved asset to the caller for immediate display on handhelds

Check reader health:

```bash
GET /api/rfid/readers
```

---

## Switching to PostgreSQL for Production

Update `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mes_db?schema=public"
```

Run migrations:

```bash
npx prisma migrate deploy
```

---

## Common Issues

**Port 3000 already in use**

```bash
# Windows — kill all Node processes
powershell -Command "Get-Process node | Stop-Process -Force"

# Delete stale lock file
rm -rf .next/dev/lock

npm run dev
```

**Build error: "Reading source code for parsing failed" / invalid UTF-8**

Turbopack cached a corrupted file. Clear the build cache:

```bash
rm -rf .next
npm run dev
```

**Prisma client out of sync after schema change**

```bash
npx prisma generate
npx prisma migrate dev
```

---

## License

Internal use only. Not for redistribution.
