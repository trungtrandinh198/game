# T01 -- WP-00: Khởi tạo repo

| | |
|---|---|
| Thứ tự | 1 / 18 |
| Cỡ | S |
| Phụ thuộc | Không |
| Song song với | Không (mọi task khác cần nó) |
| Người làm | Agent |
| Đọc trước | Mục 5.5, 14.6, 14.7, 14.9, 15.1--15.3, 18.2--18.4 |

## Mục tiêu

Có monorepo chạy được: build, lint, typecheck, test, CI và hạ tầng dev (Docker) lên bằng một lệnh. Chưa có logic nghiệp vụ.

## Việc cần làm

- [ ] Khởi tạo git (nếu chưa có), `.gitignore` (gồm `node_modules`, `dist`, `.env`, `content/maps/*/raw/`), `.nvmrc` hoặc `engines` (Node LTS từ 22).
- [ ] `.gitattributes` cho Git LFS với `content/**/*.{glb,ktx2,png,jpg,webp}`; ghi trong README cách cài `git-lfs`.
- [ ] `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `tools/*`), `turbo.json` (task `build`, `lint`, `typecheck`, `test`), `package.json` gốc với các script ở mục 18.3 (script chưa có đích thì để placeholder báo "chưa triển khai").
- [ ] `packages/config`: `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, ESM), ESLint flat config dùng chung, Prettier config.
- [ ] Luật ESLint `no-restricted-imports` thực thi ranh giới package ở mục 15.3 (đặc biệt: `game-core` không import Node/DOM/three/colyseus; `web` không import `db`).
- [ ] Khung package rỗng có `package.json`, `tsconfig.json`, `src/index.ts` và một test Vitest mẫu: `packages/schemas`, `packages/game-config`, `packages/game-core`.
- [ ] `packages/game-config`: xuất các hằng số ở bảng 8.5 (`WALK_SPEED`, `RUN_SPEED`, `PLAYER_RADIUS`, tick, `PROTOCOL_VERSION`, thông số xe...).
- [ ] `infra/docker/compose.dev.yml`: `postgres` (`postgis/postgis:16-3.4`, healthcheck), `redis`, `minio` (+ job tạo bucket `dnw-assets`, cho phép đọc công khai tiền tố `zones/`, `characters/`, `vehicles/`, `landmarks/`, `props/`, `ui/`), `mailpit`.
- [ ] `infra/docker/initdb/`: script tạo database `dnw`, `dnw_test`, extension `postgis`, `pg_trgm`, và các role `dnw_migrator`, `dnw_api`, `dnw_realtime` (phần GRANT chi tiết làm ở T05).
- [ ] `.env.example` liệt kê đủ biến ở mục 14.7 (không có giá trị bí mật thật).
- [ ] `.github/workflows/ci.yml`: cài với `--frozen-lockfile`, `lint`, `typecheck`, `test`, `build`; service Postgres (PostGIS) và Redis.
- [ ] `README.md` gốc: yêu cầu cài đặt, quick start, bảng lệnh chuẩn.
- [ ] `docs/architecture/assumptions.md` và `docs/architecture/benchmarks.md` (khung rỗng có tiêu đề).

## Sản phẩm bàn giao

`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `packages/{config,schemas,game-config,game-core}`, `infra/docker/*`, `.env.example`, `.github/workflows/ci.yml`, `README.md`, `docs/architecture/*`.

## Tiêu chí hoàn thành

-   Trên máy sạch: `pnpm install`, `docker compose -f infra/docker/compose.dev.yml up -d`, rồi `pnpm lint typecheck test build` đều qua.
-   CI chạy xanh trên một PR mẫu.
-   Cố tình thêm import vi phạm (ví dụ `three` trong `game-core`) thì ESLint báo lỗi.

## Kiểm tra

```bash
pnpm install --frozen-lockfile
docker compose -f infra/docker/compose.dev.yml up -d
docker compose -f infra/docker/compose.dev.yml ps
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Ngoài phạm vi

Logic game, schema DB, API, giao diện, content.

## Bàn giao cho task sau

Cấu trúc workspace và cách chạy hạ tầng dev; mọi task sau dùng lại.
