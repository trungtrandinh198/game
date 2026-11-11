# @dnw/db

Schema PostgreSQL + PostGIS (Drizzle ORM), migration, seed và CLI tạo admin. DDL chuẩn nằm ở mục 7.10 của tài liệu thiết kế.

## Cấu hình

Đặt trong `.env` ở gốc repo (xem `.env.example`): `MIGRATION_DATABASE_URL` (migrate, seed, admin), `DATABASE_URL` (api), `REALTIME_DATABASE_URL` (realtime), `TEST_DATABASE_URL` (test).

**Supabase:** dùng chuỗi _Session pooler_ (IPv4), ví dụ `postgresql://postgres.<ref>:<mật khẩu>@aws-1-<region>.pooler.supabase.com:5432/postgres`. Host trực tiếp `db.<ref>.supabase.co` chỉ có IPv6 nên báo `ENOTFOUND` trên mạng chỉ có IPv4. Kết nối tới `*.supabase.co/.com` luôn dùng TLS; đặt `DATABASE_SSL_CA` để kiểm tra chứng chỉ đầy đủ.

## Lệnh

```bash
pnpm db:migrate               # áp dụng migration (chạy lại an toàn)
pnpm db:seed                  # vai trò, quyền, danh mục địa danh
pnpm db:seed -- --dev         # thêm zone han-river-core (draft), 3 spawn, male-01/female-01, xe 01 (bật sẵn)
pnpm admin:create --email a@b.vn [--name "Tên"]   # tạo super_admin, hỏi mật khẩu (>= 12 ký tự)
pnpm db:generate              # sau khi sửa schema TS; phải báo "No schema changes" nếu đã có migration
pnpm --filter @dnw/db test
```

Mật khẩu cho `admin:create` nhập ẩn trên terminal; chạy tự động thì đặt tạm `ADMIN_PASSWORD` trong môi trường (không ghi vào `.env`). Băm bằng Argon2id (`hashPassword` trong `src/password.ts`), T06 dùng lại hàm này.

## Migration

| File                  | Nội dung                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| `0000_extensions.sql` | `postgis`, `pg_trgm` (schema `extensions` nếu có, như Supabase)                    |
| `0001_schema.sql`     | Bảng, ràng buộc CHECK, index GiST/GIN/expression/partial (sinh từ `src/schema`)    |
| `0002_security.sql`   | Role `dnw_api`, `dnw_realtime`, GRANT theo mục 7.11, RLS và policy cho hai role đó |

Quy tắc khi thêm migration: sửa `src/schema/*`, chạy `pnpm db:generate`, commit cả SQL. Không sửa migration đã áp dụng. Bảng mới trong `public` phải **bật RLS** và thêm policy cho `dnw_api` (và `dnw_realtime` nếu cần), vì Supabase lộ `public` qua Data API; migration `0002` làm việc này cho các bảng hiện có và `ALTER DEFAULT PRIVILEGES` chỉ cấp quyền cho `dnw_api`, chặn `anon`/`authenticated`.

## Role

Migration tạo `dnw_api` và `dnw_realtime` ở dạng `NOLOGIN`. Để dùng riêng cho từng dịch vụ:

```sql
ALTER ROLE dnw_api LOGIN PASSWORD '<bí mật>';
ALTER ROLE dnw_realtime LOGIN PASSWORD '<bí mật>';
```

`dnw_migrator` là role chạy migration (trên Supabase là `postgres`). `dnw_realtime` chỉ `SELECT users(id, status)` và các bảng nội dung, ghi `player_discoveries`, `player_progress`, `game_rooms`; không truy cập `auth_sessions`, `email_tokens`, `password_hash`. `UPDATE` và `INSERT ... ON CONFLICT` cần thêm `SELECT` trên chính bảng đó nên ba bảng ghi cũng được cấp `SELECT`.

## Test

`createTestDatabase()` (`src/testing.ts`) tạo schema ngẫu nhiên `dnw_test_*` trong `TEST_DATABASE_URL`, chạy SQL của migration vào đó, và xóa schema khi xong; mỗi test chạy trong transaction rồi rollback. Dùng schema thay vì database riêng vì Supabase chỉ có một database. `t.asRole("dnw_realtime", ...)` kiểm tra quyền theo role; cần role chạy test có quyền `SET ROLE` (Supabase `postgres`, hoặc superuser `postgres` ở CI).

Test chạm mạng nên chậm hơn test thuần (vài chục giây).

## Hình học

PostGIS dùng thứ tự `(lon, lat)`. Cột `point`/`polygon`/`multiPolygon` ghi và đọc GeoJSON `[lon, lat]`; truy vấn theo mét dùng `ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, mét)`. Test có kiểm tra trường hợp đảo thứ tự.
