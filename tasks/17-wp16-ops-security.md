# T17 -- WP-16: Vận hành và bảo mật

| | |
|---|---|
| Thứ tự | 17 / 18 |
| Cỡ | M |
| Phụ thuộc | T11 (có thể bắt đầu Docker/CI sớm hơn) |
| Song song với | T12--T16 |
| Người làm | Agent (người cấp hạ tầng, bí mật, duyệt bảo mật) |
| Đọc trước | Mục 13, 14.1--14.10, 18.5 |

## Mục tiêu

Triển khai được lên staging rồi production an toàn, có backup đã diễn tập, giám sát và tài liệu vận hành.

## Việc cần làm

### Đóng gói và triển khai

- [ ] Dockerfile nhiều tầng cho `web`, `api`, `realtime` (người dùng không phải root, chỉ copy artifact cần thiết).
- [ ] `infra/docker/compose.prod.yml` (`web`, `api`, `realtime`, `postgres`, `redis`, `caddy`), `restart: unless-stopped`, healthcheck, giới hạn bộ nhớ, `stop_grace_period: 45s` cho realtime.
- [ ] `infra/caddy/Caddyfile` theo 14.8: `/api/*` tới `api`, còn lại tới `web`, `rt.<domain>` tới `realtime`; không định tuyến `/metrics` và `/internal/*`.
- [ ] CI/CD (14.9): build/push image theo commit, tự động triển khai staging, production cần phê duyệt thủ công; thứ tự backup, migrate (`dnw_migrator`), `compose up -d`, kiểm tra `/readyz`; rollback bằng tag trước.

### Giám sát và nhật ký

- [ ] Sentry cho web, api, realtime (source map cho web), pino ra stdout.
- [ ] `/metrics` nội bộ (prom-client) với các chỉ số 8.12; kiểm tra uptime `/healthz`.
- [ ] Bảng theo dõi tối thiểu: tỉ lệ lỗi API, độ trễ API, số kết nối WebSocket, số room/người, tick delay, tỉ lệ reconnect, kết nối DB/Redis, lỗi tải asset.

### Backup và khôi phục

- [ ] Backup PostgreSQL hằng ngày (`pg_dump` hoặc công cụ tương đương) ra object storage, kèm WAL/PITR nếu dịch vụ hỗ trợ; object storage bật versioning.
- [ ] Script và tài liệu khôi phục; **diễn tập khôi phục vào DB mới** và ghi biên bản.

### Bảo mật

- [ ] Rà soát theo OWASP ASVS cấp 1 (danh sách đánh dấu trong `docs/operations/security-checklist.md`).
- [ ] Kiểm tra header HTTP (helmet, HSTS), cookie, CSRF, rate limit, upload; `pnpm audit --prod`; quét image (ví dụ Trivy) nếu có.
- [ ] Quản lý bí mật qua biến môi trường/secret manager; không có `.env` hay bí mật trong Git (quét bằng công cụ như gitleaks trong CI).
- [ ] Giới hạn kết nối WebSocket theo IP; database/Redis không mở ra Internet.

### Tài liệu

- [ ] `docs/operations/`: hướng dẫn deploy, rollback, backup/restore, runbook sự cố (realtime quá tải, DB đầy, kết nối Redis hỏng), cách thêm nội dung mới lên production.

## Sản phẩm bàn giao

`infra/**`, `.github/workflows/*`, `docs/operations/**`.

## Tiêu chí hoàn thành

-   Staging triển khai tự động từ CI; production có bước phê duyệt.
-   Khôi phục backup vào DB mới thành công, có biên bản.
-   Loadtest 30 bot chạy trên staging, số đo ghi vào `benchmarks.md`.
-   Không có bí mật trong repo (quét sạch); `pnpm audit --prod` không lỗi mức cao.
-   Rollback bằng tag trước chạy được và image cũ vẫn tương thích schema mới (mục 7.13).

## Kiểm tra

```bash
docker compose -f infra/docker/compose.prod.yml config
docker compose -f infra/docker/compose.prod.yml build
./infra/scripts/restore-drill.sh   # trên môi trường thử, không phải production
pnpm loadtest -- --clients 30 --url wss://rt.<staging-domain>
```

## Ngoài phạm vi

Nhiều vùng/nhiều tiến trình realtime, Kubernetes, CDN nâng cao.

## Lưu ý

Không chạy lệnh phá hủy hay thao tác trực tiếp trên production; thao tác cần quyền/bí mật do người thực hiện.

## Bàn giao cho task sau

T18 dùng staging và biên bản restore.
