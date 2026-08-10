#!/bin/sh
# Scheduling loop for the `backup` docker-compose service: runs backup.sh
# immediately on container start, then every BACKUP_INTERVAL_HOURS.
#
# Deliberately a plain sleep loop instead of installing a cron daemon into
# the postgres:16 image — there's exactly one job to run, so cron's config
# file, log routing, and signal-handling quirks aren't worth taking on. The
# container's only runtime dependency stays the pg_dump/gzip/psql binaries
# already present in the postgres image.
set -eu

: "${BACKUP_INTERVAL_HOURS:=24}"
interval_seconds=$((BACKUP_INTERVAL_HOURS * 3600))

echo "[backup] scheduler starting — interval: every ${BACKUP_INTERVAL_HOURS}h, retention: ${BACKUP_RETENTION_DAYS:-14} days"

while true; do
  # Invoked via `sh` explicitly rather than executed directly, so this
  # doesn't depend on the executable bit surviving however these files get
  # onto the host running docker-compose (e.g. a zip export, or a
  # filesystem/transport that doesn't preserve Unix permissions).
  sh /scripts/backup.sh || echo "[backup] $(date -u +%FT%TZ) run failed, will retry next cycle" >&2
  sleep "$interval_seconds"
done
