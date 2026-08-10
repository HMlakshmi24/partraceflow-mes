# Self-hosted Docker Compose deployment

`docker-compose.yml` runs Postgres, Mosquitto (MQTT), the app, and an nginx
TLS-terminating reverse proxy. First-time setup requires generating a
certificate and broker credentials — the stack will refuse to start (by
design) until these exist, rather than silently falling back to plaintext
HTTP or an unauthenticated broker.

## One-time setup

From `mes-app/`:

1. Copy `.env.example` to `.env` and fill in `POSTGRES_USER`,
   `POSTGRES_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET` (all required —
   `docker-compose.yml` fails fast with a clear error if any are missing or
   left as the example placeholder).

2. Generate a TLS certificate for nginx:

   ```bash
   ./deploy/nginx/generate-dev-cert.sh your-domain-or-localhost
   ```

   This produces a self-signed certificate under `deploy/nginx/certs/`
   (gitignored). It's sufficient for local testing — browsers will show a
   trust warning, which is expected. For any deployment reachable beyond
   localhost, replace `deploy/nginx/certs/fullchain.pem` and `privkey.pem`
   with a real CA-issued certificate (e.g. via `certbot`) for your actual
   domain, using the same filenames.

3. If you need live MQTT telemetry, generate broker credentials:

   ```bash
   ./deploy/mosquitto/generate-credentials.sh <username>
   ```

   Then set `MQTT_USERNAME` / `MQTT_PASSWORD` in `.env` to match. Without
   this step the `mqtt` container starts with an empty password file, which
   means **all** connections are rejected (fail-closed) rather than falling
   back to anonymous access.

4. `docker compose up --build`

The app is reachable at `https://localhost` (via nginx on 443, redirected
from 80). Postgres and Mosquitto are not published to the host by default —
see the commented-out `ports:` blocks in `docker-compose.yml` if you need
direct host access for local debugging, or need real edge devices/PLCs on
your factory network to reach the broker directly.

## Database backups

The `backup` service in `docker-compose.yml` runs a `pg_dump` of the live
database on a schedule (default: every 24h, `BACKUP_INTERVAL_HOURS`),
gzip-compresses it, writes it into the `backups` named volume, and deletes
anything older than `BACKUP_RETENTION_DAYS` (default: 14). It starts
automatically with `docker compose up` — no separate setup step.

This is deliberately a *separate container* from `app`, for the reason
`lib/services/BackupService.ts` documents in code: an application server
handling HTTP requests has no business also being the thing that decides
when to dump a multi-GB production database over an HTTP-triggered action.
`BackupService.createBackup()` in production mode takes no DB action for
exactly this reason — it reports `DATABASE_DUMP_HOOK_REQUIRED` and defers to
this real pipeline.

**This alone is not a complete disaster-recovery story.** The `backups`
volume lives on the same Docker host as `pgdata` — if that host's disk
fails, is wiped, or the whole VM is lost, both are gone together. For a real
production deployment, add an off-host copy step (a periodic `rclone`/`aws
s3 sync`/`rsync` of the `backups` volume to object storage or a second
machine) — this repo does not include one, since it requires credentials
and a destination this project can't choose on your behalf.

### Checking backups exist

```bash
docker compose run --rm backup ls -la /backups
docker compose logs backup --tail 50
```

### Restore runbook

Restoring is **destructive** — it drops and reloads every object the dump
contains in the target database. Practiced and verified against a throwaway
container as part of building this (see below); follow these steps for a
real restore:

1. **Stop the app** so nothing writes to the database mid-restore:
   ```bash
   docker compose stop app
   ```
2. **List available backups** and pick one:
   ```bash
   docker compose run --rm backup ls -la /backups
   ```
3. **Restore** (requires the explicit `--yes` — the script refuses to run
   without it and prints what it's about to overwrite):
   ```bash
   docker compose run --rm backup sh /scripts/restore.sh partraceflow-<timestamp>.sql.gz --yes
   ```
4. **Restart the app**:
   ```bash
   docker compose start app
   ```
5. **Verify**: check `https://your-domain/api/health` reports
   `"database": true`, and spot-check that expected recent records are
   present (or correctly absent, if you restored an older dump on purpose).

If you need to restore onto a *different* host (the original host is gone
entirely), copy the `.sql.gz` file to the new host's `backups` volume first
(e.g. `docker cp` or by mounting the volume), then follow the same steps.
