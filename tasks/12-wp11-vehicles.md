# T12 -- WP-11: Phương tiện

| | |
|---|---|
| Thứ tự | 12 / 18 |
| Cỡ | L |
| Phụ thuộc | T08, T11 |
| Song song với | T13 |
| Người làm | Agent (người duyệt cảm giác lái) |
| Đọc trước | Mục 3.1 (lái xe), 3.6, 7.10 (vehicle_*), 8.7, 8.13, 9.9, 11.2 (phương tiện), 16.3, 16.10, 16.11 |

## Mục tiêu

Người chơi lên, lái và xuống xe đạp/xe máy/ô tô đậu dọc đường; người khác thấy xe chạy; mọi thứ server authoritative.

## Việc cần làm

### Realtime

- [ ] Khi tạo room, nạp `vehicle_spawn_points` `is_active` của zone (kèm `vehicle_types.is_active`), chọn tối đa `MAX_VEHICLES_PER_ROOM` theo tỷ lệ 50/25/25 với seed theo `roomId`; tạo `VehicleState`.
- [ ] `mount`: kiểm tra đang đi bộ, xe tồn tại và `driverId` rỗng, khoảng cách <= `VEHICLE_MOUNT_RANGE_M + 1`, cooldown 500 ms; trả `notice` mã `VEHICLE_TOO_FAR`, `VEHICLE_OCCUPIED` khi từ chối; hai người cùng lúc thì message đến trước thắng.
- [ ] `dismount`: tốc độ <= `VEHICLE_DISMOUNT_MAX_SPEED` (`VEHICLE_TOO_FAST`), thử vị trí trái/phải/sau (1.2--2 m), chọn vị trí không va chạm và trong biên (`VEHICLE_NO_DISMOUNT_SPACE`).
- [ ] `drive` (input hợp lệ theo zod, cùng giới hạn tần suất với `input`); khi đang lái thì `input` bị bỏ qua; giữ input cuối 250 ms rồi về trung tính và phanh nhẹ.
- [ ] Trong khi lái: `PlayerState.x/z/rotY` không cập nhật; kiểm tra vị trí phía server (ví dụ `discover`) dùng vị trí xe.
- [ ] Mất kết nối/kick khi đang lái: giải phóng ghế, xe tự phanh đến dừng; reconnect trong 20 giây và xe chưa có người khác thì khôi phục chỗ ngồi.
- [ ] Xe bị bỏ >= `VEHICLE_ABANDON_RESPAWN_S` giây và không có người trong 20 m thì về spawn gốc; xe rơi ra ngoài biên hoặc kẹt > 10 giây cũng được đặt lại.
- [ ] Metrics `dnw_vehicles_total`, `dnw_vehicles_occupied`, `dnw_vehicle_collisions_total`, `dnw_vehicle_mount_rejected_total`.

### API

- [ ] `GET /api/v1/vehicle-types` (loại đang bật: `code`, `kind`, `modelUrl`, `thumbnailUrl`, `config`, `contentVersion`).
- [ ] Admin API: `GET/PATCH /admin/vehicle-types[/:id]` và `GET/PATCH /admin/zones/:id/vehicle-spawns[/:spawnId]` (quyền `vehicles.manage`, ghi audit; giao diện làm ở T14).

### Client

- [ ] Nạp model xe từ `GET /vehicle-types`; đặt người lái vào socket `seat_driver` kèm `riderOffset`, phát clip theo `pose` (`ride_bicycle`/`ride_motorbike`/`sit_car`), ẩn người lái nếu `hideRider`.
- [ ] Bánh xe quay theo `speed`, bánh lái/`handlebar` theo `steer`; camera theo xe (khoảng cách theo loại), FOV nhẹ theo tốc độ (tùy chọn).
- [ ] Dự đoán + reconcile cho người lái; nội suy cho xe người khác.
- [ ] Giao diện: nút "Lên xe"/"Xuống xe" khi gần xe, ga/phanh/phanh tay, đồng hồ tốc độ; điều khiển mobile theo 3.1.
- [ ] `InstancedMesh` cho xe đậu cùng loại; xe có người lái là mesh riêng; LOD1 xa quá 60 m; chỉ render trong 150 m; giới hạn 12 xe trên mobile, 40 trên desktop.

### Nội dung

- [ ] Người duyệt `content/maps/han-river-core/vehicle_spawns.json` (từ `map:suggest-vehicle-spawns`) rồi `content:sync`.

## Sản phẩm bàn giao

`apps/realtime/src/vehicles/**`, `apps/api/src/modules/vehicles/**`, `packages/game-client/src/vehicles/**`, `vehicle_spawns.json` đã duyệt, e2e.

## Tiêu chí hoàn thành

-   e2e hai người: A lên xe và lái, B thấy xe và người lái ngồi đúng tư thế; B **không** lên được xe có người lái; xuống xe chỉ khi đủ chậm.
-   Test: tốc độ không vượt `maxSpeed * surfaceFactor` dù client gửi input bất thường; xe ở tốc độ tối đa không xuyên tường (100 lần thử); xe bị bỏ quay về spawn; `drive` bị bỏ qua khi không lái xe.
-   Cảm giác lái ba loại xe được người duyệt chấp nhận trên điện thoại; thông số chỉnh trong `content/vehicles/*/vehicle.json` rồi `content:sync`, không sửa code.
-   Đạt ngưỡng hiệu năng của T04 khi có đủ xe trong room.

## Kiểm tra

```bash
pnpm --filter realtime test -- vehicles
pnpm --filter game-core test
pnpm e2e -- --grep vehicles
```

## Ngoài phạm vi

Hành khách, va chạm xe với người/xe khác, sát thương, cướp xe, còi/âm thanh, giao thông NPC, loại xe mới (thuyền).

## Bàn giao cho task sau

T14 làm giao diện admin quản lý xe; T16 tối ưu render xe.
