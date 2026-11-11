# Runbook Sự cố

## 1. Realtime quá tải

**Dấu hiệu:** Tick delay > 100ms, nhiều client reconnect, CPU realtime > 80%.

**Xử lý:**
1. Kiểm tra số room và player: `docker compose logs realtime | grep "room"`
2. Nếu 1 room > 30 player: Colyseus tự tạo room mới (kiểm tra log)
3. Nếu CPU cao: giảm `TICK_RATE` trong env (mặc định 30 → 20)
4. Nếu vẫn quá tải: scale out (chạy thêm 1 container realtime, load balance ở Caddy)
5. Khẩn cấp: `docker compose restart realtime` (client tự reconnect)

**Phòng ngừa:**
- Monitor tick delay p95 < 50ms
- Alert khi > 100ms trong 2 phút
- Giới hạn max room size = 30

## 2. DB đầy / chậm

**Dấu hiệu:** API 500, query timeout, disk usage > 80%.

**Xử lý:**
1. Kiểm tra disk: `docker compose exec postgres df -h /var/lib/postgresql`
2. Kiểm tra table bloat:
   ```sql
   SELECT relname, n_live_tup, n_dead_tup
   FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
   ```
3. VACUUM: `docker compose exec postgres psql -U dnw -d dnw -c "VACUUM ANALYZE;"`
4. Nếu disk > 90%: xóa backup cũ, tăng volume
5. Nếu query chậm: kiểm tra `pg_stat_statements`, thêm index

**Phòng ngừa:**
- Alert disk > 70%
- Auto VACUUM (mặc định PostgreSQL)
- Monitor slow queries > 1s

## 3. Redis hỏng / mất kết nối

**Dấu hiệu:** Rate limit không hoạt động, presence không sync, API 500.

**Xử lý:**
1. Kiểm tra: `docker compose exec redis redis-cli -a $REDIS_PASSWORD ping`
2. Nếu không ping được: `docker compose restart redis`
3. Kiểm tra memory: `redis-cli info memory` (used_memory > maxmemory?)
4. Nếu OOM: tăng `mem_limit` trong compose, hoặc thêm `maxmemory-policy allkeys-lru`
5. API/realtime tự reconnect (ioredis retry strategy)

**Phòng ngừa:**
- Redis persistence: `appendonly yes`
- Alert khi used_memory > 80% maxmemory
- Monitor connection count

## 4. API 500 liên tục

**Dấu hiệu:** Error rate > 5%, nhiều 500 trong log.

**Xử lý:**
1. Xem log: `docker compose logs api --tail=100`
2. Kiểm tra DB connection: `docker compose exec postgres pg_isready`
3. Kiểm tra Redis: `docker compose exec redis redis-cli ping`
4. Nếu DB/Redis OK: kiểm tra code (deploy mới?)
5. Rollback nếu deploy mới gây lỗi:
   ```bash
   docker compose -f infra/docker/compose.prod.yml pull api
   docker compose -f infra/docker/compose.prod.yml up -d api
   ```

## 5. TLS / Certificate hết hạn

**Dấu hiệu:** Browser cảnh báo cert, Caddy log "certificate expired".

**Xử lý:**
1. Caddy tự renew (ACME) — kiểm tra log: `docker compose logs caddy | grep -i cert`
2. Nếu renew fail: kiểm tra DNS, port 80/443 mở
3. Thủ công: `docker compose exec caddy caddy renew --domain <domain>`
4. Nếu ACME provider hết quota: chờ reset hoặc đổi provider

**Phòng ngừa:**
- Alert khi cert < 14 ngày
- Caddy auto-renew mặc định

## 6. Object storage (S3/MinIO) không reachable

**Dấu hiệu:** Asset 404, content không load, upload fail.

**Xử lý:**
1. Kiểm tra: `curl -I https://<s3-endpoint>/<bucket>/catalog.json`
2. Nếu MinIO down: `docker compose restart minio`
3. Kiểm tra credentials: `S3_ACCESS_KEY`, `S3_SECRET_KEY`
4. Kiểm tra bucket policy: public read cho assets

## 7. Memory leak (tăng liên tục)

**Dấu hiệu:** RSS tăng đều, OOM kill.

**Xử lý:**
1. Xác định service: `docker stats`
2. Heap dump (Node): `kill -USR1 <pid>` → xem `.heapsnapshot`
3. Restart service: `docker compose restart <service>`
4. Nếu lặp lại: profile code, fix leak, deploy bản sửa

**Phòng ngừa:**
- Monitor RSS per service
- Alert khi RSS > 80% mem_limit
- `--max-old-space-size` cho Node

## Escalation

| Mức | Thời gian | Hành động |
| --- | --------- | --------- |
| P1 (down) | < 15 phút | Restart service, rollback nếu cần |
| P2 (degraded) | < 1 giờ | Investigate, fix |
| P3 (minor) | < 24 giờ | Schedule fix |

**Liên hệ:** (điền tên/số điện thoại on-call)
