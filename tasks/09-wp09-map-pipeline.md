# T09 -- WP-09: Pipeline bản đồ

| | |
|---|---|
| Thứ tự | 9 / 18 |
| Cỡ | L |
| Phụ thuộc | T02 (`toLocal`, định dạng surface), T08 |
| Song song với | T06, T07, T10 |
| Người làm | Agent (người duyệt kết quả trực quan và `vehicle_spawns.json`) |
| Đọc trước | Mục 4.1--4.5, 16.7--16.10, 16.12, 16.13, 9.8 (`GET /world/zones/:code`) |

## Mục tiêu

Biến dữ liệu OSM của vùng sông Hàn thành các chunk GLB + collision + surface + manifest, đưa lên object storage, và có API trả metadata zone. Bắt đầu bằng **vùng nhỏ** (khoảng 1 km x 1 km quanh Cầu Rồng), mở rộng sau khi đạt G1.

## Việc cần làm

### `tools/map-pipeline`

- [ ] Lệnh `pnpm map:build --zone <code>`, `map:publish --zone <code> --env <env>`, `map:suggest-vehicle-spawns --zone <code>`.
- [ ] Bước 1 tải (Overpass) theo `boundary.geojson`, lưu `raw/<zone>.osm.json` và `raw/<zone>.meta.json` (thời điểm, checksum); chạy tay, không chạy trong CI.
- [ ] Bước 2--5: `osmtogeojson` (building, road, water, bridge, tree, park), áp `overrides.json` và `replacesOsmBuildings`, chiếu sang tọa độ local (dùng `toLocal` của `game-core`), chuẩn hóa polygon (sửa tự cắt, bỏ < 1 m², đơn giản hóa 0.1 m).
- [ ] Bước 6 chia chunk lưới `chunkSizeM` (256 m), mã `x<gx>_z<gz>`; nhà gán theo centroid, không cắt; đường/nước/nền được cắt theo biên.
- [ ] Bước 7 dựng mesh theo bảng 16.9: nền trừ nước, nước ở `y = -0.3`, đường từ polyline theo `width`/`lanes`, vỉa hè, cầu, nhà extrude với chiều cao theo thứ tự `height` > `building:levels * 3.2` > mặc định theo loại (kẹp 3--200 m), màu theo hash id, cây/đèn tạo xác định theo seed; gộp mesh theo chunk (vertex color, tối đa 3 draw call tĩnh) và ghi GLB bằng `@gltf-transform` + meshopt.
- [ ] Bước 8 `collision.json` (đoạn thẳng, centimet) từ nhà, landmark, biên nước đi bộ/lái xe được (trừ vùng mặt cầu).
- [ ] Bước 9 `surface.bin` (header `DNSF`, ô 2 m, `0 ground / 1 pedestrian / 2 road`).
- [ ] Bước 10 `manifest.json` từng chunk và `index.json` (schema ở 16.9).
- [ ] Bước 11 publish: chunk lên trước, cập nhật `map_chunks` và `world_zones.map_version` trong một transaction, ghi `index.json` **sau cùng**.
- [ ] `suggest-vehicle-spawns`: đề xuất theo quy tắc 16.8 (lệch 1.5 m, song song đường, cách nhau >= 40 m, cách giao lộ/spawn người chơi >= 15 m, không trên cầu, ô tô chỉ đường >= 6 m, tỷ lệ 50/25/25) và ghi `vehicle_spawns.json` để người duyệt.
- [ ] Gói `fixtures/mini.osm.json` nhỏ cho test.

### API

- [ ] `GET /api/v1/world/zones/:code` (metadata, `mapVersion`, `chunkSizeM`, `origin`, `indexUrl`), `GET /api/v1/world/zones` (zone `active`).

### Viewer kiểm tra

- [ ] Trang `/dev/map-viewer` trong sandbox nạp `index.json` và hiển thị các chunk (dùng cho người duyệt trực quan).

## Sản phẩm bàn giao

`tools/map-pipeline/**`, `content/maps/han-river-core/{zone.json,boundary.geojson,overrides.json,spawn_points.json,vehicle_spawns.json}`, chunk đã publish lên MinIO, API zone, viewer.

## Tiêu chí hoàn thành

-   Test golden: đầu ra xác định (hash ổn định giữa các lần chạy).
-   Chunk phủ kín `bounds` không hở; mỗi tòa nhà thuộc đúng một chunk; khứ hồi tọa độ; kiểm tra thứ tự lon/lat.
-   Mọi GLB qua `gltf-validator`; **build thất bại** khi vượt ngân sách 16.10 (chunk trung bình <= 0.8 MB, tối đa 1.5 MB).
-   Viewer nạp được chunk thật; người duyệt xác nhận bố cục đúng vị trí thực (Cầu Rồng, sông Hàn, đường lớn).
-   `index.json` ghi cuối cùng; đổi `mapVersion` không làm hỏng client đang dùng phiên bản cũ.

## Kiểm tra

```bash
pnpm --filter map-pipeline test
pnpm map:build --zone han-river-core
pnpm map:publish --zone han-river-core --env dev
curl http://localhost:4000/api/v1/world/zones/han-river-core
```

## Ngoài phạm vi

Địa hình/độ cao, model landmark thật, mở rộng toàn thành phố.

## Lưu ý

Ghi chú giấy phép ODbL và cần tư vấn pháp lý trước khi phân phối dữ liệu phái sinh (mục 16.12). Origin mặc định là gần đúng, phải kiểm chứng và **khóa** trước khi publish lần đầu (không đổi origin sau đó).

## Bàn giao cho task sau

T11 nạp chunk/collision/surface thật; T12 dùng `vehicle_spawns.json`; T13 đặt địa danh theo tọa độ local.
