# T13 -- WP-12: Địa danh và nội dung song ngữ

| | |
|---|---|
| Thứ tự | 13 / 18 |
| Cỡ | L |
| Phụ thuộc | T08, T11 |
| Song song với | T12 |
| Người làm | Agent (nội dung thật do người biên tập cung cấp) |
| Đọc trước | Mục 3.5, 4.6, 7.10 (landmark_*), 8.10, 9.4, 9.8, 9.9, 10, 11.1 (F), 16.3, 16.4, 16.11 |

## Mục tiêu

Người chơi đến gần địa danh, mở bảng thông tin đúng ngôn ngữ; admin (qua API ở task này) tạo/sửa/publish địa danh, bản dịch, media với quy trình duyệt.

## Việc cần làm

### API công khai

- [ ] `GET /api/v1/landmarks` và `GET /api/v1/landmarks/:id` (chỉ `published`, chưa xóa mềm; chi tiết gồm mô tả đầy đủ, `addressText`, `historicalNote`, `media[]` kèm `copyrightCredit`, `license`).
- [ ] `GET /api/v1/world/zones/:code/landmarks?locale=` trả `localX/localZ`, bán kính, tên, mô tả ngắn, ảnh bìa, `localeUsed`.
- [ ] Fallback bản dịch: ngôn ngữ người chơi, rồi `vi`, rồi nội dung thay thế (mục 10.2); `localeUsed` phản ánh bản đã dùng.

### API quản trị (giao diện làm ở T14)

- [ ] CRUD địa danh, xóa mềm; tính `local_x/local_z` bằng `toLocal` khi tạo/sửa; kiểm tra tọa độ nằm trong `boundary` zone.
- [ ] `PUT /admin/landmarks/:id/translations/:locale`, `POST .../translations/:locale/review` (`draft` sang `reviewed`).
- [ ] `POST /admin/uploads/image` (multipart <= 5 MB, kiểm tra magic bytes, xử lý lại bằng `sharp` sang WebP, trả `storage_key`).
- [ ] Quy tắc publish (9.9): bản dịch `vi` đã `reviewed`, vị trí hợp lệ, có ảnh đại diện kèm `copyright_credit` và `license`; bản `en` chưa duyệt vẫn publish (fallback `vi`).
- [ ] Mỗi lần lưu ghi `landmark_revisions` và `admin_audit_logs`.

### Realtime

- [ ] Nạp danh sách landmark của zone vào bộ nhớ khi tạo room, làm mới mỗi 5 phút.
- [ ] `discover { landmarkCode }`: kiểm tra landmark đã publish thuộc zone, khoảng cách tới `local_x/z` <= `interaction_radius_m + 2` (dùng vị trí xe nếu đang lái), `INSERT ... ON CONFLICT DO NOTHING` vào `player_discoveries`, trả `discovered`.

### Client

- [ ] Lấy danh sách landmark của zone một lần; nút "Khám phá" khi trong bán kính (hoặc phím E); bảng thông tin (ảnh, tên, mô tả ngắn/dài, địa chỉ, ghi công ảnh, nút đóng) đúng ngôn ngữ hiện tại.
- [ ] Hiển thị landmark đã khám phá (đánh dấu nhẹ); nạp model landmark từ chunk manifest nếu có.

### Nội dung

- [ ] Ít nhất 5 địa danh mẫu ở trạng thái `draft` (ví dụ Cầu Rồng, Cầu Sông Hàn, Chợ Hàn, Bảo tàng Điêu khắc Chăm, Biển Mỹ Khê) trong `content/landmarks/*`, nội dung thật do người biên tập cung cấp và duyệt.

## Sản phẩm bàn giao

`apps/api/src/modules/{landmarks,admin/landmarks,uploads}/**`, phần realtime/client `content/landmarks/*` mẫu, test.

## Tiêu chí hoàn thành

-   Test fallback `en` sang `vi`; test từng điều kiện publish; upload từ chối file không phải ảnh hoặc quá lớn; địa danh ngoài biên bị từ chối.
-   Chỉ landmark `published` xuất hiện công khai; xóa mềm biến mất khỏi API công khai.
-   e2e: người chơi đến gần, mở bảng, đổi ngôn ngữ thấy nội dung đổi; khám phá ghi **đúng một** bản ghi `player_discoveries` dù bấm nhiều lần; khám phá từ xa bị từ chối.
-   Không có endpoint REST `discover`.

## Kiểm tra

```bash
pnpm --filter api test -- landmarks uploads
pnpm --filter realtime test -- discover
pnpm e2e -- --grep landmarks
```

## Ngoài phạm vi

Giao diện admin (T14), dịch tự động, thành tích/huy hiệu.

## Bàn giao cho task sau

T14 dựng giao diện quản trị trên các API này; T16 tối ưu model landmark.
