# content/

Mọi nội dung đồ họa của game nằm ở đây, mỗi mục một thư mục. Thêm nhân vật, xe, địa danh, khu vực hoặc vật trang trí mới **không cần sửa code**.

```text
characters/<id>/   character.json, model.glb, thumbnail.webp, LICENSE.md
vehicles/<id>/     vehicle.json, model.glb (+ model.lod1.glb), thumbnail.webp, LICENSE.md
landmarks/<code>/  landmark.json, model.glb, i18n/{vi,en}.json, media/media.json, LICENSE.md
maps/<zone>/       zone.json, boundary.geojson, spawn_points.json, vehicle_spawns.json, overrides.json
props/<id>/        prop.json, model.glb, LICENSE.md
shared/rigs/       humanoid_v1.json (xương và clip bắt buộc)
_templates/        mẫu cho `pnpm content:new`
```

## Quy trình

```bash
pnpm content:new character test-01     # tạo thư mục từ mẫu, điền id
# đặt model.glb và thumbnail.webp, sửa manifest (license, thông số)
pnpm content:validate                  # có thể thêm --kind character --id test-01
pnpm content:build                     # tối ưu GLB (meshopt), WebP, ghi dist/content/ + catalog.json
pnpm content:publish --env dev         # tải lên object storage (cần S3_* trong .env)
pnpm content:sync --env dev            # upsert DB; mục mới ở trạng thái tắt/draft
```

Sau đó bật mục mới trong trang quản trị (`is_active`, trạng thái zone/địa danh).

## Quy tắc

- `id` (hoặc `code`) dùng kebab-case, trùng tên thư mục, không đổi sau khi publish. Nó là khóa logic: `avatars.code`, `vehicle_types.code`, `landmarks.code`, `world_zones.code`.
- `version` là số nguyên, tăng khi file hoặc thông số đổi; đường dẫn trên storage là `<loại>/<id>/v<version>-<hash8>/` và bất biến.
- Mỗi mục có trường `license` (`author`, `license`, `sourceUrl`) trong manifest; thiếu thì `content:validate` từ chối. Chỉ dùng asset cho phép dùng thương mại; `pnpm content:credits` sinh `CREDITS.md`.
- Hệ tọa độ: `+X` Đông, `-Z` Bắc, `rotY = 0` hướng `+Z`; model GLB quay mặt về `+Z`, gốc ở chân/mặt đất, đơn vị mét. `headingDeg` trong spawn là hướng la bàn (0 = Bắc, 90 = Đông).
- Đổi gốc tọa độ (`origin`) của zone sau khi đã publish bản đồ là thay đổi lớn: `content:sync` bỏ qua `origin` khi `map_version > 0`.

## Quyền sở hữu khi `content:sync` (mục 16.4)

| Loại     | Git (thư mục này) sở hữu                                    | DB / admin sở hữu (không bị ghi đè)                               |
| -------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Nhân vật | `id`, model, thumbnail, rig, `version`                      | `is_active`, `sort_order`                                         |
| Xe       | `id`, `kind`, model, `handling`, ghế, `version`             | `is_active`, `sort_order`                                         |
| Địa danh | `code`, model (vị trí, bán kính, ảnh bìa chỉ khi tạo)       | bản dịch, media, trạng thái, bán kính, thứ tự, vị trí sau khi tạo |
| Zone     | tên, biên, `chunkSizeM`, `crs`, `origin` (nếu chưa publish) | trạng thái                                                        |
| Spawn    | vị trí, hướng, loại xe, thời gian hồi sinh                  | `is_active` từng điểm                                             |

Bản dịch trong `i18n/*.json` chỉ khởi tạo khi DB chưa có (`review_status = 'draft'`). Spawn người chơi khớp theo lon/lat; `content:sync` không bao giờ xóa bản ghi.

## Yêu cầu asset (mục 16.11)

- Nhân vật: tối đa 15k tam giác, 65 xương, 2 material, texture ≤ 1024, GLB ≤ 1.5 MB; clip `idle`, `walk`, `run`, `ride_bicycle`, `ride_motorbike`, `sit_car`; cao 1.5--1.9 m, gốc ở chân.
- Xe: node `body`, `seat_driver`, bánh `wheel_front`/`wheel_rear` (2 bánh) hoặc `wheel_fl`/`fr`/`rl`/`rr` (ô tô), `handlebar` tùy chọn; kích thước khớp `dimensions` ±10%; xe đạp ≤ 3k, xe máy ≤ 6k, ô tô ≤ 10k tam giác.
- Địa danh: tổng ≤ 60k tam giác các LOD, GLB ≤ 3 MB, texture ≤ 2048.

## Placeholder

`pnpm content:placeholders` sinh lại toàn bộ nội dung mẫu (khối hộp, CC0, tự tạo) và `_templates/`. Thay bằng asset thật trước khi mở công khai. KTX2 chưa bật (cần công cụ `toktx`); placeholder không dùng texture.
