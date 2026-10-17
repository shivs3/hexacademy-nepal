#!/usr/bin/env bash
# Logical PostgreSQL backup from the compose stack.
#   infrastructure/scripts/backup.sh [output-dir]
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

docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$file.partial"
mv "$file.partial" "$file"
chmod 600 "$file"

# Sanity check: the archive's table of contents must be readable.
docker compose exec -T postgres pg_restore --list < "$file" > /dev/null
echo "Backup written: $file ($(du -h "$file" | cut -f1))"

ls -1t "$out_dir"/hexacademy-*.dump 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f
