# Da Nang World

Game khám phá thành phố 3D trực tuyến nhiều người chơi (web desktop và mobile), bối cảnh Đà Nẵng.
Thiết kế đầy đủ: [da-nang-world-analysis-design-plan.md](da-nang-world-analysis-design-plan.md). Danh sách task: [tasks/README.md](tasks/README.md).

## Yêu cầu

- Node.js từ 22 (xem `.nvmrc`), pnpm (bật bằng `corepack enable`).
- Docker (PostgreSQL + PostGIS, Redis, MinIO, Mailpit) cho hạ tầng dev.
- `git-lfs` để lấy asset nhị phân trong `content/`.

## Bắt đầu nhanh

```bash
corepack enable
pnpm install
cp .env.example .env                                  # điền REALTIME_TICKET_SECRET
docker compose -f infra/docker/compose.dev.yml up -d
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Dịch vụ dev: PostgreSQL `5432`, Redis `6379`, MinIO `9000` (console `9001`), Mailpit `8025` (SMTP `1025`).

## Lệnh chuẩn

| Lệnh                                          | Việc làm                                    |
| --------------------------------------------- | ------------------------------------------- |
| `pnpm install`                                | Cài đặt phụ thuộc                           |
| `pnpm dev`                                    | Chạy web, api, realtime (có từ T02)         |
| `pnpm lint` / `pnpm typecheck`                | ESLint + Prettier / `tsc --noEmit`          |
| `pnpm test`                                   | Unit và integration test (Vitest)           |
| `pnpm build`                                  | Build toàn bộ                               |
| `pnpm e2e`                                    | Playwright (có từ T03)                      |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Migration và seed (có từ T05)               |
| `pnpm content:*`, `pnpm map:*`                | Công cụ nội dung và bản đồ (có từ T08, T09) |

Lệnh nào chưa triển khai sẽ báo rõ task phụ trách.

## Cấu trúc

```text
apps/       web, api, realtime
packages/   config, schemas, game-config, game-core, game-client, db
tools/      content-cli, map-pipeline
infra/      docker, caddy
content/    asset và manifest theo thư mục
docs/       architecture, api, operations, product
```

Quy tắc phụ thuộc giữa package: mục 15.3 của tài liệu thiết kế, được ESLint kiểm tra.
