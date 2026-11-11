#!/usr/bin/env bash
set -euo pipefail

# Daily PostgreSQL backup for Da Nang World.
# Usage: ./infra/scripts/backup.sh
# Requires: docker compose, aws cli (or mc for MinIO)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups/dnw}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/compose.prod.yml}"
POSTGRES_USER="${POSTGRES_USER:-dnw}"
POSTGRES_DB="${POSTGRES_DB:-dnw}"
S3_BUCKET="${S3_BUCKET:-dnw-assets}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# 1. pg_dump
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "$BACKUP_DIR/dnw_${TIMESTAMP}.sql.gz"

SIZE=$(du -h "$BACKUP_DIR/dnw_${TIMESTAMP}.sql.gz" | cut -f1)
echo "[$(date)] Dump complete: $SIZE"

# 2. Upload to object storage (if S3_ENDPOINT is set)
if [[ -n "${S3_ENDPOINT:-}" ]]; then
  aws s3 cp "$BACKUP_DIR/dnw_${TIMESTAMP}.sql.gz" \
    "s3://${S3_BUCKET}/backups/dnw_${TIMESTAMP}.sql.gz" \
    --endpoint-url "$S3_ENDPOINT" \
    --storage-class STANDARD
  echo "[$(date)] Uploaded to s3://${S3_BUCKET}/backups/"
fi

# 3. Cleanup local backups older than 7 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
echo "[$(date)] Cleanup complete."

echo "[$(date)] Backup finished: dnw_${TIMESTAMP}.sql.gz"
