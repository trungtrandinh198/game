# T05 -- WP-04: Gói database

| | |
|---|---|
| Thứ tự | 5 / 18 |
| Cỡ | M |
| Phụ thuộc | T01 |
| Song song với | T02, T03, T04 |
| Người làm | Agent |
| Đọc trước | Mục 5.5 (Database), 7.1, 7.10--7.13, 16.4 |

## Mục tiêu

Schema PostgreSQL + PostGIS đúng DDL tham chiếu, migration chạy sạch, seed idempotent, quyền theo role. Nền cho mọi task backend.

## Việc cần làm

- [ ] `packages/db`: `drizzle.config.ts`, `src/client.ts` (node-postgres Pool, múi giờ UTC), `src/schema/*.ts` chia nhóm: account/rbac, avatar/character, world/zone/chunk/spawn, vehicle, landmark, multiplayer/progress, moderation/audit.
- [ ] Khớp **từng bảng, cột, ràng buộc, index** của DDL ở mục 7.10 (kể cả `users.terms_accepted_at`, `avatars.content_version`, `vehicle_types`, `vehicle_spawn_points`, `landmark_revisions`, `email_tokens`).
- [ ] Kiểu `geometry` qua kiểu có sẵn của Drizzle nếu phiên bản đã cài hỗ trợ, nếu không dùng `customType`.
- [ ] Migration SQL tùy chỉnh (`drizzle-kit generate --custom`): `CREATE EXTENSION postgis, pg_trgm`, GiST index, index trên `(location::geography)`, GIN `gin_trgm_ops`, CHECK constraint, unique `lower(email)`, partial index.
- [ ] `src/roles.sql` (hoặc migration riêng): GRANT theo bảng role ở 7.11 cho `dnw_api`, `dnw_realtime` (không cho `dnw_realtime` đọc `auth_sessions`, `email_tokens`, `password_hash`).
- [ ] `normalizeDisplayName()` trong `packages/schemas` (NFKC, bỏ dấu, `đ` thành `d`, chữ thường, gộp khoảng trắng; quy tắc ký tự 3--32) và schema zod cho tên hiển thị.
- [ ] Seed idempotent (`pnpm db:seed`): vai trò, quyền và ánh xạ theo bảng 7.12, `landmark_categories`. Cờ `--dev` thêm dữ liệu placeholder: zone `han-river-core` (trạng thái `draft`), 3 spawn point, nhân vật `male-01`/`female-01`, xe `bicycle-01`/`motorbike-01`/`car-01` (bật sẵn).
- [ ] `pnpm admin:create --email ...`: tạo `super_admin`, mật khẩu nhập tương tác hoặc biến môi trường tạm, không seed mật khẩu cố định (cần hàm băm Argon2id; dùng chung với T06 qua `packages/db` hoặc thư viện nhỏ trong `apps/api/lib`, đừng nhân đôi mã).
- [ ] Helper test: tạo/xóa DB `dnw_test`, chạy migrate, transaction rollback theo từng test.

## Sản phẩm bàn giao

`packages/db/**`, `packages/schemas` (display name), tài liệu `packages/db/README.md` (cách migrate, seed, tạo role).

## Tiêu chí hoàn thành

-   `pnpm db:migrate` chạy sạch trên DB rỗng; `drizzle-kit` không báo drift giữa schema TypeScript và DB.
-   `pnpm db:seed` chạy hai lần không tạo bản ghi trùng.
-   Test đạt: unique email không phân biệt hoa thường; unique `display_name_key` (tên "Ân" và "An" trùng nhau); CHECK từ chối giá trị sai; `player_characters.user_id` unique; truy vấn `ST_DWithin` với `ST_MakePoint(lon, lat)` trả đúng địa danh (test cố ý đảo thứ tự để chứng minh sai thì không khớp).
-   Role `dnw_realtime` bị từ chối khi `SELECT password_hash`.

## Kiểm tra

```bash
pnpm db:migrate && pnpm db:seed -- --dev && pnpm db:seed -- --dev
pnpm --filter db test
```

## Ngoài phạm vi

API, giao diện, đồng bộ content (T08).

## Bàn giao cho task sau

T06 dùng bảng tài khoản/session; T08 dùng `avatars`, `vehicle_types`, `landmarks`, `world_zones`; T11, T12 dùng role `dnw_realtime`.
