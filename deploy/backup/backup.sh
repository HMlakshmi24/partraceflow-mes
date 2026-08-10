#!/bin/sh
# Runs one pg_dump of the MES database: plain-SQL, gzip-compressed,
# timestamped, with --clean --if-exists so the dump can restore cleanly over
# an existing database of the same schema. Then prunes dumps older than
# BACKUP_RETENTION_DAYS.
#
# Meant to run inside the `backup` docker-compose service (see
# docker-compose.yml), which uses the same postgres:16 image as the `postgres`
# service — guarantees pg_dump's version matches the server it's dumping.
# Not meant to be run standalone outside that container.
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=partraceflow}"
: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=14}"

mkdir -p "$BACKUP_DIR"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_file="$BACKUP_DIR/partraceflow-${timestamp}.sql.gz"
tmp_file="${dump_file}.tmp"

echo "[backup] $(date -u +%FT%TZ) starting pg_dump -> $dump_file"

if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=plain --no-owner --no-privileges --clean --if-exists \
  | gzip > "$tmp_file"; then
  mv "$tmp_file" "$dump_file"
  size=$(du -h "$dump_file" | cut -f1)
  echo "[backup] $(date -u +%FT%TZ) completed: $dump_file ($size)"
else
  echo "[backup] $(date -u +%FT%TZ) FAILED — pg_dump exited non-zero, removing partial file" >&2
  rm -f "$tmp_file"
  exit 1
fi

# Retention: delete dumps older than BACKUP_RETENTION_DAYS. -mtime works off
# each file's own modification time, so this is safe to run every cycle
# regardless of how BACKUP_INTERVAL_HOURS is configured.
find "$BACKUP_DIR" -name 'partraceflow-*.sql.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete
