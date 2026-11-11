# Báo cáo Nghiệm thu MVP — Da Nang World

| | |
|---|---|
| Ngày | _điền khi nghiệm thu_ |
| Người thực hiện | |
| Môi trường | Staging: `https://staging.dnangworld.vn` |
| Bản build | `_commit SHA_` |

## 1. Kiểm thử tự động (E2E Playwright)

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Đăng ký → xác minh email → login | _chưa chạy_ | |
| Tạo nhân vật, chọn avatar | _chưa chạy_ | |
| Vào game, thấy bản đồ | _chưa chạy_ | |
| Hai người cùng room, thấy nhau | _chưa chạy_ | |
| Lái xe, lên/xuống | _chưa chạy_ | |
| Địa danh song ngữ (vi/en) | _chưa chạy_ | |
| Admin: xem user, suspend | _chưa chạy_ | |
| Kiểm duyệt: report, action | _chưa chạy_ | |
| Mất mạng → reconnect | _chưa chạy_ | |
| Rate limit (429) | _chưa chạy_ | |

```bash
# Chạy:
E2E_BASE_URL=https://staging.dnangworld.vn pnpm e2e
```

## 2. Kiểm thử thủ công trên thiết bị thật

| Thiết bị | OS | Browser | FPS TB | FPS 5% | Draw call | Tam giác | Ghi chú |
| -------- | -- | ------- | ------ | ------ | --------- | -------- | ------- |
| | | | | | | | |
| | | | | | | | |
| | | | | | | | |

### Danh sách thiết bị cần đo

- [ ] Android tầm trung (4 GB RAM)
- [ ] iPhone (iOS 16+)
- [ ] Desktop Chrome
- [ ] Desktop Safari
- [ ] Desktop Firefox

## 3. Nghiệm thu theo mục 20

| # | Tiêu chí | Kết quả | Bằng chứng | Ngoại lệ |
| - | -------- | ------- | ---------- | -------- |
| 1 | Đăng ký và xác minh email hoạt động | | | |
| 2 | Login/logout, session đúng | | | |
| 3 | Tạo nhân vật, đổi avatar | | | |
| 4 | Vào game, bản đồ load < 15s | | | |
| 5 | Đi bộ, lái xe mượt (>= 30 FPS mobile) | | | |
| 6 | Multiplayer: thấy người khác, đồng bộ | | | |
| 7 | Xe: lên/xuống, không xuyên tường | | | |
| 8 | Địa danh: hiện tên song ngữ khi đến gần | | | |
| 9 | Admin: dashboard, user list, suspend | | | |
| 10 | Kiểm duyệt: report, moderation action | | | |
| 11 | Rate limit hoạt động | | | |
| 12 | Security headers đúng | | | |
| 13 | Mobile: touch controls hoạt động | | | |
| 14 | Tab ẩn → render pause, quay lại → resume | | | |
| 15 | WebGL context lost → overlay, restore | | | |
| 16 | Credits OSM hiển thị | | | |
| 17 | Privacy policy + Terms hiển thị, đồng ý khi đăng ký | | | |
| 18 | Xóa tài khoản/dữ liệu (luồng) | | | |
| 19 | Backup/restore drill thành công | | | |
| 20 | Loadtest 30 bot trên staging | | | |

## 4. Onboarding (người dùng thử)

| Người | Quan sát | Điểm vướng | Đã sửa? |
| ----- | -------- | ---------- | ------- |
| | | | |
| | | | |

## 5. Credits và pháp lý

- [ ] "© OpenStreetMap contributors" hiển thị trên trang credits
- [ ] Liên kết ODbL license
- [ ] Mọi asset trong `CREDITS.md` có ghi công
- [ ] Ảnh địa danh có nguồn/giấy phép
- [ ] Privacy policy: nội dung do pháp lý duyệt
- [ ] Terms of Service: nội dung do pháp lý duyệt
- [ ] Đồng ý terms khi đăng ký (checkbox)
- [ ] Luồng xóa tài khoản/dữ liệu hoạt động

## 6. Rủi ro mở (mục 17.4)

| Rủi ro | Trạng thái | Mức độ | Hành động |
| ------ | --------- | ------ | --------- |
| | | | |
| | | | |

## 7. Lỗi còn lại

| # | Mô tả | Mức độ | Chặn phát hành? | Ghi chú |
| - | ----- | ------ | -------------- | ------- |
| | | | | |

## 8. Kết luận

| | |
|---|---|
| Số lỗi chặn phát hành | |
| Số lỗi sửa sau | |
| Ngoại lệ được chấp nhận | |
| **Quyết định** | _Phát hành beta / Chưa phát hành_ |
| Người ký | |
| Ngày | |

### Duyệt bảo mật

| | |
|---|---|
| Người duyệt | |
| Ngày | |
| Ghi chú | |

### Duyệt pháp lý

| | |
|---|---|
| Người duyệt | |
| Ngày | |
| Ghi chú | |
