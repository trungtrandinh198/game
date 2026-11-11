# @dnw/api

Fastify 5 + zod (type provider) + Drizzle. Prefix `/api/v1`; tài liệu OpenAPI nằm ở `docs/api/openapi.json`.

## Chạy

```bash
pnpm --filter @dnw/api dev          # cổng API_PORT (mặc định 4000)
curl -i http://localhost:4000/readyz
pnpm --filter @dnw/api openapi      # sinh lại docs/api/openapi.json (test sẽ so khớp)
pnpm --filter @dnw/api test         # cần TEST_DATABASE_URL; tạo schema tạm rồi xóa
```

Biến môi trường (đọc từ `.env` gốc, xác thực bằng zod trong `src/config.ts`; thiếu hoặc sai thì dừng ngay):
`APP_BASE_URL`, `DATABASE_URL` (role `dnw_api`), `REDIS_URL`, `SESSION_COOKIE_NAME`, `SESSION_IDLE_DAYS`, `SESSION_ABSOLUTE_DAYS`,
`REQUIRE_EMAIL_VERIFICATION`, `SMTP_URL`, `EMAIL_FROM`, `REALTIME_TICKET_SECRET` (>= 32 ký tự, bắt buộc ở production),
`TRUST_PROXY` (`true` khi đứng sau reverse proxy để lấy IP thật), `IP_HASH_SECRET` (tùy chọn).

Không có `REDIS_URL`: giới hạn tốc độ dùng bộ nhớ trong tiến trình (chỉ cho dev một tiến trình). Không có `SMTP_URL`: thư chỉ nằm trong bộ nhớ, không gửi đi.

## Bố cục

`src/modules/<tên>/{routes,service,repo}.ts`: route khai báo schema và gọi service, service chứa nghiệp vụ, repo chứa truy vấn. Route không gọi DB trực tiếp.
`src/plugins` (lỗi, CSRF, rate limit chung, session), `src/lib` (token, mailer, mẫu thư vi/en, quyền, kho đếm Redis/bộ nhớ).

## Quy ước quan trọng

- Lỗi: một định dạng `{ error: { code, message, details?, requestId } }`, mã ở mục 9.6 (thêm `TOKEN_INVALID` 400 và `PAYLOAD_TOO_LARGE` 413).
- Session: cookie `dnw_sid` (`HttpOnly`, `SameSite=Lax`, `Secure` khi `APP_BASE_URL` là https hoặc production); DB chỉ lưu SHA-256.
- CSRF: mọi POST/PUT/PATCH/DELETE cần `Origin` đúng `APP_BASE_URL` và header `X-DNW-CSRF: 1`.
- Rate limit theo bảng 9.9 trong `src/lib/rate-limit.ts`; vượt thì `429 RATE_LIMITED` kèm `Retry-After`.
- Log pino che `cookie`, `set-cookie`, `password`, `token`; không bao giờ log nội dung thư.
- Quyền: `loadAuthorities()` trả vai trò và permission; `requirePermission` hoàn thiện ở T14.
