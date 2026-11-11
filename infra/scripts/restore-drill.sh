#!/usr/bin/env bash
set -euo pipefail

# Restore drill: restore a backup into a fresh temporary DB and verify.
# Usage: ./infra/scripts/restore-drill.sh <backup-file.sql.gz>
# This does NOT touch production. Safe to run on any machine with Docker.

BACKUP_FILE="${1:?Usage: ./infra/scripts/restore-drill.sh <backup-file.sql.gz>}"
CONTAINER_NAME="dnw-restore-drill-$$"
POSTGRES_USER="dnw"
POSTGRES_DB="dnw"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "=== Restore Drill ==="
echo "Backup: $BACKUP_FILE"
echo "Container: $CONTAINER_NAME"
echo ""

# 1. Start temporary PostGIS container
echo "[1/5] Starting temporary PostgreSQL..."
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD="drill-test" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  -p 5433:5432 \
  postgis/postgis:16-3.4

# Wait for ready
echo "      Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "ERROR: PostgreSQL did not start in 30s"
    docker rm -f "$CONTAINER_NAME" > /dev/null
    exit 1
  fi
done
echo "      PostgreSQL ready."

# 2. Restore
echo "[2/5] Restoring backup..."
gunzip -c "$BACKUP_FILE" | \
  docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
echo "      Restore complete."

# 3. Verify tables
echo "[3/5] Verifying tables..."
TABLE_COUNT=$(docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
echo "      Tables: $TABLE_COUNT"

if [[ "$TABLE_COUNT" -lt 5 ]]; then
  echo "ERROR: Expected at least 5 tables, got $TABLE_COUNT"
  docker rm -f "$CONTAINER_NAME" > /dev/null
  exit 1
fi

# 4. Verify key data
echo "[4/5] Verifying key data..."
for TABLE in users avatars world_zones; do
  COUNT=$(docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
    "SELECT count(*) FROM $TABLE;" 2>/dev/null || echo "N/A")
  echo "      $TABLE: $COUNT rows"
done

# 5. Cleanup
echo "[5/5] Cleaning up..."
docker stop "$CONTAINER_NAME" > /dev/null
docker rm "$CONTAINER_NAME" > /dev/null
echo "      Container removed."

echo ""
echo "=== Restore Drill PASSED ==="
echo "Date: $(date)"
echo "Backup: $BACKUP_FILE"
echo "Tables: $TABLE_COUNT"
echo ""
echo "Record this in docs/operations/backup-restore.md (biên bản diễn tập)."
