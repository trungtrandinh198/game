# T07 -- WP-06: Người chơi và nhân vật

| | |
|---|---|
| Thứ tự | 7 / 18 |
| Cỡ | S |
| Phụ thuộc | T06 |
| Song song với | T08, T09 |
| Người làm | Agent |
| Đọc trước | Mục 3.3, 7.10 (avatars, player_characters), 7.11 (display_name_key), 9.2, 9.8, 9.9 |

## Mục tiêu

Người chơi quản lý hồ sơ, xem danh mục nhân vật và chọn nhân vật (một nhân vật mỗi người).

## Việc cần làm

- [ ] `GET /api/v1/player/profile`, `PATCH /api/v1/player/profile` (`displayName`, `locale`, `countryCode`, `bio`).
- [ ] Quy tắc tên hiển thị: 3--32 ký tự (chữ cái, chữ số, khoảng trắng, `_`, `-`, `.`); tính `display_name_key` bằng `normalizeDisplayName`; trùng trả `409 CONFLICT_DISPLAY_NAME_TAKEN`; có điểm móc (hook) kiểm tra từ cấm, bản đầy đủ làm ở T15.
- [ ] `GET /api/v1/avatars`: danh mục nhân vật `is_active`, kèm `modelUrl`, `thumbnailUrl` dựng từ `*_key` + `CDN_BASE_URL` (hàm `cdnUrl(key)` dùng chung).
- [ ] `GET /api/v1/player/characters`, `POST /api/v1/player/characters` (`avatarId`, `appearanceConfig`; lần hai trả `409 CHARACTER_ALREADY_EXISTS`), `PATCH /api/v1/player/characters/:id` (đổi avatar/cấu hình).
- [ ] Kiểm tra `avatars.is_active = true`; `appearanceConfig` theo schema giới hạn, tối đa 2 KB, từ chối khóa lạ.
- [ ] `GET /api/v1/player/progress`.
- [ ] Đồng bộ `GET /auth/me` để `hasCharacter` đúng.
- [ ] Cập nhật OpenAPI.

## Sản phẩm bàn giao

`apps/api/src/modules/{player,avatars}/**`, test, OpenAPI cập nhật.

## Tiêu chí hoàn thành

Test: tên trùng sau chuẩn hóa bỏ dấu và hoa/thường; `CHARACTER_ALREADY_EXISTS`; không chọn được avatar `is_active = false`; user A không sửa được nhân vật của user B; `locale` chỉ nhận `vi`/`en`; tất cả endpoint cần session hợp lệ (trừ `GET /avatars` cho khách xem danh mục).

## Kiểm tra

```bash
pnpm --filter api test -- player avatars
```

## Ngoài phạm vi

Giao diện chọn nhân vật (T10), tải model 3D, kiểm duyệt từ cấm đầy đủ (T15).

## Bàn giao cho task sau

T10 gọi các endpoint này; T11 (`join`) đọc nhân vật đã chọn.
