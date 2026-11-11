# Hướng dẫn Deploy

## Yêu cầu

- Docker + Docker Compose v2
- Domain đã trỏ DNS về server
- Biến môi trường (xem `.env.example`)

## Biến môi trường bắt buộc

| Biến | Ý nghĩa | Ví dụ |
| ---- | -------- | ----- |
| `DOMAIN` | Domain chính | `dnangworld.vn` |
| `APP_BASE_URL` | URL public của API | `https://dnangworld.vn` |
| `REALTIME_PUBLIC_URL` | URL WebSocket | `wss://rt.dnangworld.vn` |
| `POSTGRES_PASSWORD` | Mật khẩu DB | (tạo ngẫu nhiên 32+ ký tự) |
| `REDIS_PASSWORD` | Mật khẩu Redis | (tạo ngẫu nhiên 32+ ký tự) |
| `JWT_SECRET` | Secret ký JWT | (tạo ngẫu nhiên 64+ ký tự) |

## Deploy lần đầu

```bash
# 1. Clone repo
git clone <repo-url> /opt/dnw
cd /opt/dnw

# 2. Tạo .env từ template
cp .env.example .env
# Sửa các giá trị trong .env

# 3. Build và khởi động
docker compose -f infra/docker/compose.prod.yml build
docker compose -f infra/docker/compose.prod.yml up -d

# 4. Chạy migration
docker compose -f infra/docker/compose.prod.yml exec -T api \
  npx tsx packages/db/src/cli/migrate.ts

# 5. Seed data (chỉ lần đầu)
docker compose -f infra/docker/compose.prod.yml exec -T api \
  npx tsx packages/db/src/cli/seed.ts

# 6. Tạo admin
docker compose -f infra/docker/compose.prod.yml exec -T api \
  npx tsx packages/db/src/cli/admin-create.ts

# 7. Kiểm tra
curl https://<domain>/healthz
curl https://<domain>/readyz
```

## Deploy bản mới (CI tự động)

CI/CD tự động:
1. Build image → push GHCR
2. Deploy staging (tự động)
3. Deploy production (cần approve trong GitHub Environments)

## Deploy thủ công

```bash
cd /opt/dnw
git pull origin main
docker compose -f infra/docker/compose.prod.yml pull
docker compose -f infra/docker/compose.prod.yml up -d
```

## Rollback

```bash
# Xem các image đã build
docker images | grep "ghcr.io/<org>/dnw"

# Tag image cũ
docker tag ghcr.io/<org>/dnw/api:<old-sha> ghcr.io/<org>/dnw/api:rollback

# Pull và restart với image cũ
docker compose -f infra/docker/compose.prod.yml pull api
docker compose -f infra/docker/compose.prod.yml up -d api
```

**Lưu ý:** Image cũ phải tương thích schema DB mới (mục 7.13). Không rollback schema.

## Thêm nội dung mới lên production

```bash
# 1. Build content
pnpm content:build

# 2. Publish lên object storage
pnpm content:publish --env prod

# 3. Sync vào DB
pnpm content:sync --env prod
```

## Kiểm tra sau deploy

```bash
# Health
curl -sf https://<domain>/healthz
curl -sf https://<domain>/readyz

# API
curl -sf https://<domain>/api/world/zones

# Realtime
wscat -c wss://rt.<domain>

# Logs
docker compose -f infra/docker/compose.prod.yml logs -f --tail=50
```
