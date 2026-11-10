# T14 -- WP-13: Admin và RBAC

| | |
|---|---|
| Thứ tự | 14 / 18 |
| Cỡ | L |
| Phụ thuộc | T06, T12, T13 |
| Song song với | T16, T17 |
| Người làm | Agent |
| Đọc trước | Mục 2.1, 7.12, 9.5, 9.9, 11.2, 13.4, 15.4, 15.5 |

## Mục tiêu

Khu vực quản trị đầy đủ, phân quyền thật ở backend, mọi thao tác ghi đều có nhật ký. Chỉ làm sau khi qua G1 và đã có API địa danh/xe.

## Việc cần làm

### Backend

- [ ] Middleware `requirePermission(code)` ở API, đọc quyền từ `user_roles`/`role_permissions`; từ chối `403 FORBIDDEN` khi thiếu quyền, `401` khi chưa đăng nhập.
- [ ] `GET /admin/dashboard` (tổng tài khoản, người online từ Redis, người mới theo ngày/tuần, số room, địa danh đã publish, báo cáo chưa xử lý, biểu đồ theo thời gian).
- [ ] Người dùng: `GET /admin/users` (tìm theo email/tên/ID, dùng `pg_trgm`), `GET /admin/users/:id`, `PATCH /admin/users/:id/status`, `PUT /admin/users/:id/roles` (chỉ `users.roles.assign`).
- [ ] Avatar: `GET/POST/PATCH /admin/avatars[/:id]` (bật/tắt, thứ tự; thông số kỹ thuật chỉ đọc vì thuộc Git).
- [ ] Room: `GET /admin/rooms` (số người, sức chứa, trạng thái, instance), `POST /admin/rooms/:id/drain|close` chuyển lệnh qua kênh Redis `dnw:rooms`.
- [ ] `GET /admin/audit-logs` (lọc theo người, hành động, thời gian). Mọi thao tác ghi dưới `/admin` ghi `admin_audit_logs` (không chứa mật khẩu/token).
- [ ] Báo cáo: `GET /admin/reports`, `POST /admin/reports/:id/resolve` (hoàn thiện cùng T15).

### Giao diện (`apps/web/.../admin`)

- [ ] Layout admin, điều hướng theo quyền (chỉ để ẩn/hiện UI; quyền thật ở API).
- [ ] Màn hình: Dashboard, Người dùng (tìm, hồ sơ, trạng thái, vai trò, lịch sử xử lý), Avatar, **Phương tiện** (loại xe, điểm spawn, bật/tắt), Địa danh (danh sách, lọc, tạo/sửa/xóa mềm, nhập tọa độ trên bản đồ Leaflet, bán kính tương tác, upload ảnh, preview), Bản dịch (tab vi/en, trạng thái đủ/thiếu, duyệt), Room, Báo cáo, Nhật ký admin.
- [ ] Công cụ chọn tọa độ dùng nền bản đồ đúng chính sách sử dụng tile (lưu lượng thấp hoặc nguồn tự lưu), có nhập tay lon/lat.
- [ ] Bảng dữ liệu bằng TanStack Table, form bằng react-hook-form + zod, thông báo lỗi theo 9.6.

## Sản phẩm bàn giao

`apps/api/src/modules/admin/**`, `apps/web/src/app/[locale]/admin/**`, test ma trận quyền.

## Tiêu chí hoàn thành

-   Ma trận test **mỗi endpoint x mỗi vai trò** (guest, player, moderator, content_editor, admin, super_admin) trả đúng 401/403/200 theo bảng 7.12.
-   Mọi thao tác ghi dưới `/admin` tạo `admin_audit_logs`; metadata không chứa dữ liệu nhạy cảm.
-   Người chơi thường vào `/admin` bị từ chối (cả UI lẫn API).
-   e2e: content_editor tạo địa danh, nhập bản dịch, duyệt, publish; admin khóa người dùng; admin tắt một loại xe thì xe đó không còn sinh trong room mới.
-   Chỉ `super_admin` gán được vai trò.

## Kiểm tra

```bash
pnpm --filter api test -- admin rbac
pnpm e2e -- --grep admin
```

## Ngoài phạm vi

Kiểm duyệt realtime (kick, ban: T15), sửa thông số xe qua giao diện.

## Bàn giao cho task sau

T15 bổ sung hành động kiểm duyệt trên cùng khu vực admin.
