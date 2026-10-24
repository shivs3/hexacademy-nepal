#!/usr/bin/env bash
# Logical PostgreSQL backup.
#   infrastructure/scripts/backup.sh [output-dir]
# By default it dumps the compose stack's postgres service. With DATABASE_URL
# set (e.g. a managed database), it runs the host's pg_dump against that URL
# instead; keep the password in ~/.pgpass or PGPASSFILE rather than the URL so
# it does not appear in the process list.
# Produces a custom-format dump (pg_restore-compatible), keeps the newest
# $BACKUP_KEEP files (default 14). Copy the output off-host (e.g. to a private
# R2 bucket with rclone) — a backup on the same disk is not a backup.
set -euo pipefail

cd "$(dirname "$0")/../.."
out_dir="${1:-./backups}"
keep="${BACKUP_KEEP:-14}"
mkdir -p "$out_dir"
chmod 700 "$out_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$out_dir/hexacademy-$stamp.dump"

umask 077
if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$file.partial"
else
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$file.partial"
fi
mv "$file.partial" "$file"

# Sanity check: the archive's table of contents must be readable.
if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_restore --list "$file" > /dev/null
else
  docker compose exec -T postgres pg_restore --list < "$file" > /dev/null
fi
echo "Backup written: $file ($(du -h "$file" | cut -f1))"

ls -1t "$out_dir"/hexacademy-*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do rm -f "$old"; done
