# T02 -- WP-01: Prototype 3D client và game-core

| | |
|---|---|
| Thứ tự | 2 / 18 |
| Cỡ | M |
| Phụ thuộc | T01 |
| Song song với | T05 (database) |
| Người làm | Agent |
| Đọc trước | Mục 3.1, 3.6, 5.5 (web và game client), 8.9, 8.13, 12.3, 16.7, 16.10 |

## Mục tiêu

Chứng minh 3D chạy được trên desktop **và điện thoại thật**, đồng thời có sẵn logic di chuyển/va chạm/lái xe dùng chung client-server. Đây là phép thử rủi ro đầu tiên (hiệu năng mobile, cảm giác lái).

## Việc cần làm

### `packages/game-core` (hàm thuần, không phụ thuộc Node/DOM)

- [ ] `movement/stepPlayer`: tích phân vận tốc từ input (`moveX`, `moveZ`, `run`, `yaw`), chuẩn hóa vector, trả trạng thái mới (8.9).
- [ ] `collision/`: đoạn thẳng, lưới băm 8 m, va chạm hình tròn - đoạn thẳng có trượt dọc cạnh.
- [ ] `vehicle/stepVehicle`: mô hình động học 8.13 (ga/phanh/lùi/phanh tay, lực cản, góc lái giảm theo tốc độ, `yawRate = speed / wheelbase * tan(steer)`), substep theo `VEHICLE_SUBSTEP_MAX_M`, va chạm thân xe bằng 2--3 hình tròn, hệ số bề mặt.
- [ ] `surface/surfaceAt`: đọc lưới `surface.bin` (định dạng ở 16.9) trả `road | pedestrian | ground`.
- [ ] `geo/projection`: `toLocal(zone, lon, lat)` và `toGeo(zone, x, z)` (UTM 49N bằng `proj4`, gốc theo zone; quy ước +X Đông, -Z Bắc), `pointInPolygon`.
- [ ] Quy ước: `rotY = 0` hướng +Z; vector tiến `(sin rotY, cos rotY)`.

### `packages/game-client` (React Three Fiber)

- [ ] Cảnh thử: nền thủ tục, vài trăm khối nhà ngẫu nhiên xác định (seed cố định), đoạn "đường" để xe chạy, đoạn "nước" làm vật cản.
- [ ] Nhân vật placeholder (capsule hoặc GLB đơn giản), camera ngôi thứ ba theo sau.
- [ ] Điều khiển desktop (WASD, Shift, chuột phải xoay, F lên/xuống xe, Space phanh tay) và mobile (joystick bằng Pointer Events, kéo vùng phải xoay camera, nút chạy/lên xe/phanh tay).
- [ ] Ba xe placeholder (xe đạp, xe máy, ô tô: khối hộp + bánh) với thông số bảng 16.3; lên/xuống xe cục bộ theo quy tắc 3.6.
- [ ] Overlay FPS/draw call/tam giác (`r3f-perf` hoặc `stats-gl`), preset chất lượng thấp/trung/cao (bóng, `devicePixelRatio`).
- [ ] Vị trí người chơi và xe giữ trong ref/đối tượng mutable, không dùng React state mỗi frame.

### `apps/web`

- [ ] Khởi tạo Next.js (App Router) tối thiểu, trang `/dev/sandbox` chỉ nạp game bằng `dynamic(..., { ssr: false })`.

## Sản phẩm bàn giao

`packages/game-core/src/**`, `packages/game-client/src/**`, `apps/web/src/app/dev/sandbox/page.tsx`, mục "WP-01" trong `docs/architecture/benchmarks.md` (số đo ban đầu).

## Tiêu chí hoàn thành

-   Test `game-core` bao phủ (>= 90% dòng của `stepPlayer`, `stepVehicle`, va chạm): tốc độ tối đa, vector chéo không nhanh hơn, trượt tường, xe tối đa tốc độ **không xuyên tường mỏng** trong 100 lần thử ngẫu nhiên, hệ số bề mặt đúng, khứ hồi tọa độ sai số < 0.01 m, thứ tự lon/lat đúng.
-   Chạy được trên desktop và trên điện thoại thật qua mạng LAN; ghi model thiết bị, FPS, draw call vào `benchmarks.md`.
-   Lên/xuống xe và lái cả ba loại xe hoạt động.

## Kiểm tra

```bash
pnpm --filter game-core test -- --coverage
pnpm --filter web dev    # mở http://<ip-may>:3000/dev/sandbox từ điện thoại
pnpm lint && pnpm typecheck
```

## Ngoài phạm vi

Kết nối mạng, dữ liệu bản đồ thật, tài khoản, giao diện sản phẩm.

## Lưu ý

-   `game-core` phải là nguồn duy nhất của logic di chuyển; T03 sẽ dùng lại ở server.
-   Hằng số lấy từ `game-config`, không viết cứng trong hàm.

## Bàn giao cho task sau

T03 dùng `stepPlayer`, `stepVehicle`, va chạm; T04 dùng số đo; T09 dùng `toLocal` và định dạng `surface.bin`.
