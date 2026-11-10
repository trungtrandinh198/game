# T03 -- WP-02: Prototype multiplayer

| | |
|---|---|
| Thứ tự | 3 / 18 |
| Cỡ | M |
| Phụ thuộc | T02 |
| Song song với | T05, T06 (backend) |
| Người làm | Agent |
| Đọc trước | Mục 6.3, 8.1--8.9, 8.12, 8.13, 15.6, 17.3 |

## Mục tiêu

Hai trình duyệt thấy nhau và thấy xe của nhau; server là nguồn sự thật; đo được tải với 30 bot. Chưa có tài khoản thật, DB hay bản đồ thật.

## Việc cần làm

### `apps/realtime`

- [ ] Khởi tạo Colyseus (đọc tài liệu đúng phiên bản đã cài), `main.ts` với `/healthz`, `/metrics`, tắt êm khi nhận SIGTERM (mã đóng 4006).
- [ ] `state/`: `PlayerState`, `VehicleState`, `CityState` đúng 8.6.
- [ ] `rooms/CityRoom.ts`: `filterBy ['zoneCode']`, `ROOM_CAPACITY`, simulation 20 Hz, patch 20 Hz, seat reservation 15 s, `allowReconnection` 20 s.
- [ ] Xử lý message với zod (schema ở `packages/schemas`): `input`, `drive`, `mount`, `dismount` (8.7); hàng đợi input tối đa 8, giữ input cuối 250 ms, giới hạn 40 msg/giây, kích thước payload 1 KB.
- [ ] Mô phỏng bằng `game-core` (`stepPlayer`, `stepVehicle`); **không bao giờ nhận vị trí từ client**.
- [ ] Nạp `collision.json` từ fixture trong repo (đúng định dạng 16.9); sinh vài xe cố định từ cấu hình fixture.
- [ ] Ticket dev: script ký JWT HS256 (`REALTIME_TICKET_SECRET`), chỉ chấp nhận khi `NODE_ENV=development`.
- [ ] Metrics: `dnw_rooms`, `dnw_players`, `dnw_tick_duration_ms`, `dnw_dropped_inputs_total`, `dnw_invalid_messages_total`.

### `packages/game-client` (phần mạng)

- [ ] `net/colyseusClient`: kết nối bằng ticket dev, gửi `input`/`drive` 20 Hz và khi đổi.
- [ ] `net/interpolation`: bộ đệm ~100 ms cho người chơi và xe của người khác; bánh quay theo `speed`, lái theo `steer`.
- [ ] `net/prediction`: dự đoán cho nhân vật/xe của mình, reconcile theo `lastInputSeq` (kéo mượt khi lệch > 0.25 m, đặt lại khi > 2 m), có cờ bật/tắt.
- [ ] Hiển thị tên trên đầu người chơi khác.

### Công cụ

- [ ] `pnpm loadtest -- --clients 30`: bot di chuyển ngẫu nhiên, một phần bot lên xe và lái; in p50/p95 tick duration, băng thông.

## Sản phẩm bàn giao

`apps/realtime/src/**`, `packages/schemas` (message realtime), `packages/game-client/src/net/**`, script loadtest, e2e Playwright, mục "WP-02" trong `benchmarks.md`.

## Tiêu chí hoàn thành

-   Playwright mở hai context: cả hai thấy nhau; A lên xe và lái, B thấy xe di chuyển; A rời thì B không còn thấy.
-   Test chứng minh: `moveX = 100` hoặc gửi input dồn dập không làm vượt `RUN_SPEED`; `drive` không vượt `maxSpeed * surfaceFactor`; không lên được xe đang có người lái.
-   Loadtest 30 bot: ghi vào `benchmarks.md` giá trị p95 tick, băng thông xuống mỗi client (mục tiêu ở 17.5: p95 <= 10 ms, <= 30 KB/s).
-   `players` trong state không chứa email hay userId.

## Kiểm tra

```bash
pnpm --filter realtime test
pnpm e2e -- --grep multiplayer
pnpm loadtest -- --clients 30
```

## Ngoài phạm vi

Xác thực thật, DB, lưu tiến trình, Redis presence, kick, bản đồ thật.

## Bàn giao cho task sau

T04 dùng số đo; T11 thay ticket dev bằng ticket thật và nạp dữ liệu thật.
