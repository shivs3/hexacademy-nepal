#!/usr/bin/env bash
# Restores a dump produced by backup.sh into the compose database.
#   infrastructure/scripts/restore.sh backups/hexacademy-20260101T000000Z.dump
# This REPLACES the current database contents. Application containers are
# stopped during the restore. Test restores regularly on a staging stack.
set -euo pipefail

cd "$(dirname "$0")/../.."
file="${1:?usage: restore.sh <dump-file>}"
[[ -f "$file" ]] || { echo "No such file: $file" >&2; exit 1; }

read -r -p "This will overwrite the database in this compose project. Type 'restore' to continue: " answer
[[ "$answer" == "restore" ]] || { echo "Aborted."; exit 1; }

docker compose stop backend worker beat frontend
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$file"
docker compose run --rm migrate
docker compose start backend worker beat frontend
echo "Restore complete."
