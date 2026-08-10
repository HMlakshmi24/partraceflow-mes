#!/bin/sh
# Restores the MES database from a backup produced by backup.sh.
#
# DESTRUCTIVE: the dump was taken with --clean --if-exists, so loading it
# drops and recreates every object it contains in the target database before
# reloading data. Run manually only — never wired into any scheduled or
# automatic path. Requires an explicit --yes to actually run.
#
# Usage (from the host):
#   docker compose run --rm backup sh /scripts/restore.sh <filename> --yes
#
# List available backups first:
#   docker compose run --rm backup ls /backups
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=partraceflow}"
: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"
: "${BACKUP_DIR:=/backups}"

file="${1:-}"
confirm="${2:-}"

if [ -z "$file" ]; then
  echo "Usage: restore.sh <backup-filename> --yes" >&2
  echo "Available backups in $BACKUP_DIR:" >&2
  ls -1 "$BACKUP_DIR" 2>/dev/null | grep '\.sql\.gz$' >&2 || echo "  (none found)" >&2
  exit 1
fi

dump_path="$BACKUP_DIR/$file"
if [ ! -f "$dump_path" ]; then
  echo "Backup file not found: $dump_path" >&2
  exit 1
fi

if [ "$confirm" != "--yes" ]; then
  echo "This will PERMANENTLY OVERWRITE database '$POSTGRES_DB' on $POSTGRES_HOST with:" >&2
  echo "  $dump_path" >&2
  echo "All data currently in that database will be lost. Re-run with --yes to proceed:" >&2
  echo "  restore.sh $file --yes" >&2
  exit 1
fi

echo "[restore] $(date -u +%FT%TZ) restoring $dump_path into '$POSTGRES_DB' on $POSTGRES_HOST..."

gunzip -c "$dump_path" | PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --single-transaction --set ON_ERROR_STOP=on

echo "[restore] $(date -u +%FT%TZ) restore complete."
