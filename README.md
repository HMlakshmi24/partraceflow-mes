# ParTraceflow MES

ParTraceflow MES is a manufacturing execution system for pipe spool fabrication and shop floor operations. It covers production tracking, scheduling, quality control, traceability, RFID ingestion, maintenance, reporting, and workflow approvals.

## Core modules

- Supervisor dashboard
- Shop floor operator terminal
- Pipe spool lifecycle management
- Quality and SPC
- ERP planning and scheduling
- Shift management
- Traceability and genealogy
- RFID and device integration
- Andon and alerting
- MES copilot and audit trails

## Tech stack

- Next.js 16
- React 19
- Prisma ORM
- PostgreSQL
- Zod validation
- Lucide React
- Recharts

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- PostgreSQL

## Setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create `.env` in `mes-app/`.

   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/mes_dev"
   SESSION_SECRET="replace-with-a-random-hex-string"
   ```

3. Apply database migrations.

   ```bash
   npx prisma migrate dev
   ```

4. Start the application.

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run test`

## Production notes

- Use `npx prisma migrate deploy` in production.
- Keep generated files, local databases, scratch scripts, and report outputs out of version control.
- Prefer production data flows over demo seeding when validating the system.
- Two deployment paths are supported and are **not equivalent**: Vercel (serverless — assumes an external managed Postgres and Redis, and cannot hold the persistent MQTT connection real-time telemetry needs) and self-hosted Docker Compose (bundles Postgres, Mosquitto, and an nginx TLS proxy — see [`deploy/README.md`](deploy/README.md) for required one-time setup before `docker compose up`).

## Repository layout

- `app/` - route handlers and pages
- `components/` - shared React components
- `lib/` - business logic, services, connectors, and utilities
- `prisma/` - schema and migrations
- `public/` - static assets
- `deploy/` - deployment configuration
