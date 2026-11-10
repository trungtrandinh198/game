# T06 -- WP-05: API nền tảng và xác thực

| | |
|---|---|
| Thứ tự | 6 / 18 |
| Cỡ | L |
| Phụ thuộc | T05 |
| Song song với | T08, T09 (content, bản đồ) |
| Người làm | Agent |
| Đọc trước | Mục 5.5 (API, Xác thực), 6.3, 9.1, 9.6--9.9, 13.1, 14.9, 15.4, 18.2, 18.5 |

## Mục tiêu

Dịch vụ API chạy được với đăng ký, đăng nhập, session cookie an toàn, xác minh email, đặt lại mật khẩu, rate limit, định dạng lỗi chuẩn và OpenAPI tự sinh.

## Việc cần làm

### Nền tảng (`apps/api`)

- [ ] `config.ts` đọc env bằng zod, thất bại ngay khi thiếu/sai; không log bí mật.
- [ ] `app.ts` dựng Fastify (dùng được trong test), `main.ts` khởi động.
- [ ] Plugin: kết nối DB (role `dnw_api`), Redis, pino + `requestId` (`x-request-id`), helmet, cookie, error handler theo định dạng và mã ở 9.6, `AppError(code, httpStatus)`, rate limit lưu Redis theo bảng 9.9, OpenAPI (`docs/api/openapi.json`) sinh từ schema zod.
- [ ] `/healthz`, `/readyz` (kiểm tra DB và Redis).
- [ ] Bố cục module theo 15.4 (`routes.ts`, `service.ts`, `repo.ts`); route không gọi DB trực tiếp.

### Xác thực (`modules/auth`)

- [ ] `POST /auth/register`: kiểm tra `acceptTerms`, luôn trả `202 { status: "verification_sent" }` (chống dò email: email đã có thì gửi thư thông báo thay vì thư xác minh), tạo `users` (`pending`) + `user_profiles` + vai trò `player`, lưu `terms_accepted_at`.
- [ ] `POST /auth/login`: Argon2id, lỗi chung `AUTH_INVALID_CREDENTIALS`, chặn `suspended/banned` (`AUTH_ACCOUNT_SUSPENDED`), yêu cầu xác minh email khi `REQUIRE_EMAIL_VERIFICATION=true` (`AUTH_EMAIL_NOT_VERIFIED`), cập nhật `last_login_at`, đặt cookie `dnw_sid`.
- [ ] Session theo 9.7: 32 byte ngẫu nhiên base64url, lưu SHA-256; hết hạn trượt 14 ngày, tuyệt đối 30 ngày; cập nhật `last_seen_at` tối đa 5 phút/lần.
- [ ] `POST /auth/logout`, `GET /auth/me` (trả `user` gồm `roles`, `permissions`, `hasCharacter`).
- [ ] `POST /auth/verify-email`, `POST /auth/resend-verification` (token 32 byte, lưu hash, hạn 24 giờ, dùng một lần).
- [ ] `POST /auth/forgot-password` (luôn 202), `POST /auth/reset-password` (hạn 1 giờ, dùng một lần, thu hồi mọi session), đổi mật khẩu (thu hồi session khác).
- [ ] CSRF: yêu cầu `Origin` khớp `APP_BASE_URL` và header `X-DNW-CSRF: 1` cho POST/PUT/PATCH/DELETE (`CSRF_REJECTED`).
- [ ] Mật khẩu 10--128 ký tự; Argon2id tham số theo khuyến nghị OWASP hiện hành.
- [ ] Mailer nodemailer, mẫu email `vi`/`en` (xác minh, đặt lại, email đã tồn tại); dev gửi tới Mailpit.
- [ ] Bộ nạp quyền (`lib/permissions`): trả danh sách permission của user từ `user_roles`/`role_permissions` (middleware `requirePermission` hoàn thiện ở T14).

## Sản phẩm bàn giao

`apps/api/src/**`, `docs/api/openapi.json`, mẫu email, tài liệu ngắn `apps/api/README.md`.

## Tiêu chí hoàn thành

Integration test (Vitest + DB test + Redis) cho mỗi endpoint, bao gồm:

-   Đăng ký email mới và email đã tồn tại cho **cùng phản hồi**.
-   Rate limit: vượt ngưỡng trả `429 RATE_LIMITED`.
-   CSRF: thiếu header hoặc sai Origin thì `403`.
-   Session: hết hạn, bị thu hồi, đổi mật khẩu thu hồi session khác, cookie đúng cờ (`HttpOnly`, `SameSite=Lax`, `Secure` ngoài dev).
-   Token email dùng hai lần thì lần hai bị từ chối; token hết hạn bị từ chối.
-   Log không chứa mật khẩu, token, cookie.
-   `pnpm lint typecheck test build` qua; OpenAPI sinh lại khớp commit.

## Kiểm tra

```bash
pnpm --filter api test
pnpm --filter api build && pnpm --filter api start &
curl -i http://localhost:4000/readyz
```

## Ngoài phạm vi

Hồ sơ/nhân vật (T07), RBAC đầy đủ và admin (T14), giao diện (T10).

## Bàn giao cho task sau

T07 mở rộng cùng app; T10 dùng OpenAPI để tạo API client; T14 hoàn thiện `requirePermission`.
