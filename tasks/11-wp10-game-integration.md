# T11 -- WP-10: Tích hợp game

| | |
|---|---|
| Thứ tự | 11 / 18 |
| Cỡ | L |
| Phụ thuộc | T03, **T04 (G1 đạt)**, T07, T09, T10 |
| Song song với | T17 (bắt đầu sớm phần Docker) |
| Người làm | Agent |
| Đọc trước | Mục 6.3, 8.1--8.12, 9.8 (`join`), 11.1 (D, E), 14.9, 16.9, 16.10 |

## Mục tiêu

Người chơi thật đi từ đăng nhập đến đi dạo trong bản đồ thật cùng người khác, qua ticket an toàn, có reconnect và lưu tiến trình. Thay mọi thứ "dev" của T03 bằng luồng thật.

## Việc cần làm

### API

- [ ] `POST /api/v1/world/join`: kiểm tra session, `users.status = 'active'`, email đã xác minh (nếu bật), có nhân vật (`CHARACTER_REQUIRED`), zone `active` (`ZONE_UNAVAILABLE`); ký JWT HS256 60 giây với claim ở 8.8; trả `{ ticket, realtimeUrl, roomName, protocolVersion }`.
- [ ] `POST /api/v1/world/leave` (nếu cần dọn presence).

### Realtime

- [ ] `onAuth` theo thứ tự 8.8: verify chữ ký/`iss`/`aud`/`exp`, `pv`, `SET ticket:{jti} NX EX 60` (Redis), đọc `users.status`, nhân vật, avatar từ DB (role `dnw_realtime`), kiểm tra zone `active`. Tên, avatar, userId lấy từ DB, không từ client.
- [ ] Nạp `collision.json` và `surface.bin` thật từ CDN cho mọi chunk của zone; cache theo `(zone, mapVersion)` dùng chung giữa các room.
- [ ] Spawn theo 8.10 (chọn `spawn_points`, lệch <= 1 m, kiểm tra không trong vật cản; khôi phục vị trí cũ chỉ khi hợp lệ).
- [ ] Một phiên mỗi user: Redis `presence:user:{userId}`; phiên mới kick phiên cũ (mã 4003).
- [ ] Đăng ký kênh Redis `dnw:moderation` (kick/ban); đóng kết nối với mã ở 8.11.
- [ ] Lưu `player_progress` khi rời và mỗi 60 giây.
- [ ] Ghi/cập nhật `game_rooms` khi tạo/đóng room (số người cao nhất).
- [ ] Giới hạn tốc độ và chỉ số ở 8.12; tắt êm (`stop_grace_period`).

### Client (`packages/game-client` + `apps/web`)

- [ ] Luồng join: gọi `world/join`, tải `index.json` và chunk 3 x 3 quanh điểm spawn (màn loading chờ xong), kết nối bằng ticket thật.
- [ ] Nạp chunk động theo 16.10 (tải trước theo hướng di chuyển, giải phóng chunk xa bằng `dispose`, tối đa 4 request đồng thời, thử lại 3 lần).
- [ ] Nạp model nhân vật từ `GET /avatars` (cache), tên trên đầu người chơi khác.
- [ ] Kết nối lại với backoff 0.5/1/2/4 giây trong 20 giây; quá hạn thì `join` lại; giao diện thông báo kết nối.
- [ ] Hiển thị thông báo `notice`/`kicked` đã bản địa hóa; cài đặt camera.

## Sản phẩm bàn giao

`apps/api/src/modules/world/**`, `apps/realtime/src/**` (hoàn thiện), `packages/game-client/**`, e2e.

## Tiêu chí hoàn thành

-   Playwright: hai người dùng thật đi qua đăng nhập, vào **cùng room**, thấy nhau di chuyển trên bản đồ thật, không đi xuyên nhà/nước.
-   Ngắt mạng thì client hiển thị kết nối lại và vào lại được; quá hạn thì tự `join` lại và spawn an toàn.
-   Đăng nhập ở nơi khác: phiên cũ bị đóng với mã 4003.
-   Ticket dùng lần hai bị từ chối; ticket hết hạn bị từ chối; `pv` sai bị đóng 4004; tài khoản `suspended/banned` không vào được.
-   `players` trong state không chứa email/userId.
-   Bộ nhớ client ổn định sau khi đi qua nhiều chunk (không rò).

## Kiểm tra

```bash
pnpm --filter realtime test
pnpm --filter api test -- world
pnpm e2e -- --grep "game integration"
```

## Ngoài phạm vi

Xe (T12), địa danh (T13), kiểm duyệt đầy đủ (T15), tối ưu sâu (T16).

## Bàn giao cho task sau

T12 và T13 mở rộng cùng room và client; T15 dùng kênh `dnw:moderation`.
