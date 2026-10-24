#!/usr/bin/env bash
# Restores a dump produced by backup.sh.
#   infrastructure/scripts/restore.sh backups/hexacademy-20260101T000000Z.dump
# This REPLACES the target database contents. By default the target is the
# compose database, and the application containers are stopped during the
# restore. With DATABASE_URL set, the host's pg_restore writes to that URL;
# stop anything using that database first, and run `manage.py migrate`
# afterwards. Test restores regularly on a staging or scratch database.
set -euo pipefail

cd "$(dirname "$0")/../.."
file="${1:?usage: restore.sh <dump-file>}"
[[ -f "$file" ]] || { echo "No such file: $file" >&2; exit 1; }

target="the database in this compose project"
[[ -n "${DATABASE_URL:-}" ]] && target="the database at DATABASE_URL"
read -r -p "This will overwrite $target. Type 'restore' to continue: " answer
[[ "$answer" == "restore" ]] || { echo "Aborted."; exit 1; }

if [[ -n "${DATABASE_URL:-}" ]]; then
  pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --single-transaction "$file"
  echo "Restore complete. Run migrations (manage.py migrate) before starting the application."
  exit 0
fi

docker compose stop backend worker beat frontend
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$file"
docker compose run --rm migrate
docker compose start backend worker beat frontend
echo "Restore complete."
