# @dnw/map-pipeline

Biến dữ liệu OSM của một zone thành chunk GLB + va chạm + bề mặt + manifest (mục 16.8--16.10).

```bash
pnpm map:download --zone han-river-core            # tải OSM (Overpass), chạy tay một lần; ghi content/maps/<zone>/raw/ (gitignore)
pnpm map:build --zone han-river-core [--map-version 1]   # -> dist/maps/zones/<zone>/v<N>/
pnpm map:publish --zone han-river-core --env dev --map-version 1   # cần S3_* và DB; chunk -> DB (một transaction) -> index.json
pnpm map:suggest-vehicle-spawns --zone han-river-core [--max 40]  # ghi vehicle_spawns.json để người duyệt
pnpm --filter @dnw/map-pipeline test
```

Xem kết quả: chạy `pnpm dev`, mở `/dev/map-viewer` (đọc `dist/maps` qua `/dev/map-data`, chỉ ở dev).

- Dữ liệu © OpenStreetMap contributors (ODbL). Cần tư vấn pháp lý về phân phối dữ liệu phái sinh trước khi mở công khai (mục 16.12); `raw/*.meta.json` ghi nguồn và thời điểm tải.
- Kết quả xác định (không dùng thời gian/ngẫu nhiên không seed) nên hash ổn định giữa các lần build.
- Build thất bại khi `static.glb` vượt 1.5 MB, trung bình > 0.8 MB, hoặc GLB không qua `gltf-validator`.
- Chunk cắt đường/nước/nền theo biên; nhà gán theo centroid. Va chạm là đoạn thẳng (cm), biên nước trừ hành lang cầu. `surface.bin` ô 2 m: 0 đất, 1 đi bộ, 2 đường (cầu tính là đường).
- Boolean polygon dùng `clipper-lib` (số nguyên mm) vì `polygon-clipping` lỗi trên dải đường có đoạn nối trùng cạnh.
- `fixtures/mini.osm.json` do `pnpm --filter @dnw/map-pipeline fixture` sinh (dựng tay, dùng cho test).
- Chưa có object storage cục bộ nên chưa publish thật; viewer đọc trực tiếp từ `dist/maps`.
