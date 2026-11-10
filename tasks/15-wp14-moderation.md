# T15 -- WP-14: Kiểm duyệt

| | |
|---|---|
| Thứ tự | 15 / 18 |
| Cỡ | M |
| Phụ thuộc | T11, T14 |
| Song song với | T16, T17 |
| Người làm | Agent |
| Đọc trước | Mục 7.10 (user_reports, user_moderation_actions), 8.11, 9.9, 13.2--13.4 |

## Mục tiêu

Người chơi báo cáo được người khác; moderator xử lý (kick, suspend, ban, unban); hành động có hiệu lực ngay trong game và được ghi vết.

## Việc cần làm

- [ ] `POST /api/v1/reports` (người chơi báo cáo: `reportedUserId`, `reasonCode`, `description`); rate limit 10/giờ/người; không tự báo cáo mình; không lộ danh tính người báo cáo cho người bị báo cáo.
- [ ] Hoàn thiện `GET /admin/reports`, `POST /admin/reports/:id/resolve` (trạng thái `open`, `reviewing`, `resolved`, `rejected`, `handled_by`, `resolved_at`).
- [ ] `POST /admin/users/:id/moderation` (quyền `moderation.act`): `kick`, `suspend` (kèm `expires_at`), `ban`, `unban`; ghi `user_moderation_actions` và `admin_audit_logs`; đổi `users.status` tương ứng.
- [ ] Hiệu lực ngay: API đăng sự kiện lên kênh Redis `dnw:moderation` (`{ type, userId, reason }`); realtime ngắt kết nối người đang online (4001 kick, 4002 khóa/ban) và từ chối join mới ở `onAuth`.
- [ ] Hết hạn `suspend`: kiểm tra `expires_at` khi đăng nhập và khi `join` (không cần worker); khi hết hạn tự đưa về `active` kèm ghi vết.
- [ ] Từ cấm cho tên hiển thị `vi`/`en` (danh sách trong `packages/schemas`, không phân biệt dấu/hoa thường); áp dụng lúc đăng ký và đổi tên; admin có thể bắt buộc đổi tên.
- [ ] Giao diện người chơi: báo cáo từ tên trên đầu hoặc danh sách người chơi gần; xác nhận gửi.
- [ ] Giao diện admin: danh sách báo cáo, chi tiết, nút hành động, lịch sử xử lý của người dùng.
- [ ] Trang thông tin kháng nghị (liên hệ) và thông báo rõ lý do khi bị khóa.

## Sản phẩm bàn giao

`apps/api/src/modules/{reports,moderation}/**`, `apps/realtime/src/services/moderation.ts`, giao diện, test.

## Tiêu chí hoàn thành

-   Test: kick ngắt kết nối người đang chơi trong vài giây; tài khoản `suspended/banned` không join/đăng nhập được; `unban` khôi phục; `suspend` hết hạn tự khôi phục.
-   Chỉ vai trò có `moderation.act` mới thực hiện được; moderator không đổi được vai trò.
-   Mọi hành động ghi `user_moderation_actions` và `admin_audit_logs`.
-   Tên chứa từ cấm bị từ chối với thông báo đúng ngôn ngữ.
-   Người bị báo cáo không đọc được thông tin người báo cáo qua API.

## Kiểm tra

```bash
pnpm --filter api test -- reports moderation
pnpm --filter realtime test -- moderation
pnpm e2e -- --grep moderation
```

## Ngoài phạm vi

Chat, mute (chưa có chat), kháng nghị tự động.

## Bàn giao cho task sau

T18 đưa vào danh sách nghiệm thu.
