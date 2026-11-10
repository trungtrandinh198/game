# T08 -- WP-08: Hệ thống content

| | |
|---|---|
| Thứ tự | 8 / 18 |
| Cỡ | M |
| Phụ thuộc | T05 |
| Song song với | T06, T07, T09 (chuẩn bị) |
| Người làm | Agent |
| Đọc trước | Mục 1.1 (mục tiêu 8), 15.1--15.3, 16.1--16.6, 16.11, 16.12, 16.13 |

## Mục tiêu

Thêm nhân vật, xe, địa danh, khu vực mới chỉ bằng thư mục `content/` và vài lệnh CLI, không sửa code. Kèm nội dung placeholder để các task sau chạy được.

## Việc cần làm

### Schema và cấu trúc

- [ ] Zod schema cho manifest trong `packages/schemas/content`: `character.json`, `vehicle.json`, `landmark.json`, `zone.json`, `vehicle_spawns.json`, `spawn_points.json`, `prop.json`, `media.json` (trường như mục 16.3, có `schemaVersion`, `id`, `version`, `license`).
- [ ] Dựng cây `content/` theo 16.2 với `README.md` hướng dẫn và `_templates/` cho từng loại.
- [ ] `content/shared/rigs/humanoid_v1.json`: danh sách xương (tối thiểu hông, cột sống, ngực, cổ, đầu, vai/tay/bàn tay hai bên, đùi/cẳng/bàn chân hai bên) và clip bắt buộc `idle`, `walk`, `run`, `ride_bicycle`, `ride_motorbike`, `sit_car`.

### `tools/content-cli`

- [ ] `content:new <kind> <id>`: sao chép từ `_templates/`, điền `id`.
- [ ] `content:validate [--kind] [--id]`: kiểm tra manifest bằng zod, file tồn tại, license đủ, `id` kebab-case và duy nhất; mở GLB bằng `@gltf-transform` để kiểm tra số tam giác, số xương, tên clip, tên node bắt buộc của xe (`body`, `seat_driver`, `wheel_*`), kích thước so với `dimensions` (±10%), dung lượng, texture; địa danh nằm trong biên zone.
- [ ] `content:build`: tối ưu GLB (meshopt, KTX2 nếu có `toktx`), tạo thumbnail/WebP bằng `sharp`, ghi `dist/content/` theo bố cục 16.6 (tên có `v<version>-<hash8>`).
- [ ] `content:publish --env`: upload lên S3 với header cache đúng (bất biến cho tệp có version).
- [ ] `content:sync --env`: upsert DB theo quyền sở hữu ở 16.4 (mục mới tạo ở trạng thái tắt/`draft`; mục cũ chỉ cập nhật phần Git sở hữu; không ghi đè `is_active`, bản dịch, trạng thái, media); idempotent; `i18n/*.json` địa danh chỉ khởi tạo bản dịch khi DB chưa có.
- [ ] Sinh `CREDITS.md` từ trường `license` của mọi mục.

### Nội dung placeholder

- [ ] Script tạo GLB placeholder: nhân vật `male-01`, `male-02`, `female-01`, `female-02` (đúng rig và 6 clip, hình dạng đơn giản), xe `bicycle-01`, `motorbike-01`, `car-01` (đủ node bắt buộc), một địa danh mẫu (khối hộp), props `tree-01`, `street-lamp-01`. Ghi rõ trong `LICENSE.md` là placeholder tự tạo (CC0).

## Sản phẩm bàn giao

`content/**` (khung + placeholder), `tools/content-cli/**`, schema trong `packages/schemas`, `content/README.md`.

## Tiêu chí hoàn thành

-   `content:validate` bắt đúng các lỗi: thiếu license, thiếu node/clip, vượt ngân sách, `id` trùng, địa danh ngoài biên.
-   `content:sync` chạy hai lần không đổi gì; sửa bản dịch/`is_active` trong DB rồi sync lại **không** bị ghi đè (test).
-   Quy trình `content:new character test-01` rồi đặt file, validate, build, publish, sync tạo mục tắt trong DB; không cần sửa code ở bất kỳ app nào.
-   Hash/đường dẫn trên object storage đúng 16.6.

## Kiểm tra

```bash
pnpm content:validate
pnpm content:build && pnpm content:publish --env dev && pnpm content:sync --env dev
pnpm --filter content-cli test
```

## Ngoài phạm vi

Pipeline bản đồ (T09), giao diện admin, asset thật (do người cung cấp).

## Bàn giao cho task sau

T09 dùng `maps/<zone>`; T10 dùng thumbnail nhân vật; T11--T13 đọc catalog từ DB/API đã được sync.
