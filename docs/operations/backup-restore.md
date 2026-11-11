# Backup và Khôi phục

## Backup

### Tự động (hằng ngày)

Cron job trên server (chạy 2h sáng mỗi ngày):

```bash
# /etc/cron.d/dnw-backup
0 2 * * * dnw cd /opt/dnw && ./infra/scripts/backup.sh >> /var/log/dnw-backup.log 2>&1
```

Script `infra/scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/dnw"
mkdir -p "$BACKUP_DIR"

# 1. pg_dump
docker compose -f infra/docker/compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-dnw}" -d "${POSTGRES_DB:-dnw}" \
  | gzip > "$BACKUP_DIR/dnw_${TIMESTAMP}.sql.gz"

# 2. Upload lên object storage (S3/MinIO)
#    Bật versioning trên bucket
aws s3 cp "$BACKUP_DIR/dnw_${TIMESTAMP}.sql.gz" \
  "s3://${S3_BUCKET}/backups/dnw_${TIMESTAMP}.sql.gz" \
  --storage-class STANDARD

# 3. Xóa backup local > 7 ngày
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "[$(date)] Backup complete: dnw_${TIMESTAMP}.sql.gz"
```

### WAL / PITR

Nếu dùng managed PostgreSQL (RDS, Cloud SQL, Supabase):
- Bật WAL archiving
- Retention: 7 ngày
- PITR cho khôi phục về bất kỳ thời điểm nào trong 7 ngày

## Khôi phục

### Khôi phục vào DB mới (drill)

```bash
# 1. Tạo DB trống
docker run -d --name restore-test \
  -e POSTGRES_USER=dnw -e POSTGRES_PASSWORD=test -e POSTGRES_DB=dnw \
  -p 5433:5432 postgis/postgis:16-3.4

# 2. Restore
gunzip -c /backups/dnw/dnw_<TIMESTAMP>.sql.gz | \
  docker exec -i restore-test psql -U dnw -d dnw

# 3. Verify
docker exec restore-test psql -U dnw -d dnw -c "\dt"
docker exec restore-test psql -U dnw -d dnw -c "SELECT count(*) FROM users;"

# 4. Cleanup
docker stop restore-test && docker rm restore-test
```

### Khôi phục production (incident)

1. **Dừng services:**
   ```bash
   docker compose -f infra/docker/compose.prod.yml stop api realtime web
   ```

2. **Xóa volume DB:**
   ```bash
   docker compose -f infra/docker/compose.prod.yml down -v postgres
   ```

3. **Khởi động lại postgres:**
   ```bash
   docker compose -f infra/docker/compose.prod.yml up -d postgres
   ```

4. **Restore từ backup:**
   ```bash
   gunzip -c /backups/dnw/dnw_<TIMESTAMP>.sql.gz | \
     docker compose -f infra/docker/compose.prod.yml exec -T postgres \
     psql -U dnw -d dnw
   ```

5. **Chạy migration (nếu cần):**
   ```bash
   docker compose -f infra/docker/compose.prod.yml exec -T api \
     npx tsx packages/db/src/cli/migrate.ts
   ```

6. **Khởi động lại services:**
   ```bash
   docker compose -f infra/docker/compose.prod.yml up -d
   ```

7. **Verify:**
   ```bash
   curl -sf http://localhost:8080/readyz
   ```

## Biên bản diễn tập

| Ngày | Người thực hiện | Backup dùng | Kết quả | Ghi chú |
| ---- | --------------- | ----------- | ------- | ------- |
| | | | | |

## Lưu ý

- **Không** restore trực tiếp lên production mà không có backup trước
- Luôn backup trước khi restore
- Kiểm tra integrity: `SELECT count(*)` trên các bảng chính
- Object storage: bật versioning, lifecycle policy (delete > 30 ngày)
- Test restore **ít nhất mỗi quý**
