# Số đo hiệu năng

Điền số đo thật trên thiết bị thật. Ngưỡng và quy trình: mục 12.3 và 17.5 của tài liệu thiết kế.

## Thiết bị đã chọn

| Thiết bị | Hệ điều hành | Trình duyệt | Ghi chú |
| -------- | ------------ | ----------- | ------- |

## WP-01 (prototype 3D client)

Trang `/dev/sandbox`: cảnh thủ tục ~300 khối nhà (một `InstancedMesh`), đường, sông + cầu,
5 xe placeholder, nhân vật capsule. Số liệu lấy trực tiếp từ HUD (`FPS`, `draw`, `tam giác`).

| Thiết bị                                                  | Trình duyệt | Preset                 | FPS TB | FPS 5% thấp | Draw call              | Tam giác  | Ghi chú                                      |
| --------------------------------------------------------- | ----------- | ---------------------- | ------ | ----------- | ---------------------- | --------- | -------------------------------------------- |
| MacBook Air (Apple Silicon), trình duyệt tích hợp VS Code | Chromium    | trung bình (bóng 1024) | 60     | 54--59      | 28--63 (theo góc nhìn) | 8.6k--10k | Đi bộ, lái xe đạp/ô tô, không tụt khung hình |
| Android tầm trung                                         | _chưa đo_   |                        |        |             |                        |           | Cần người đo (xem bên dưới)                  |
| iPhone                                                    | _chưa đo_   |                        |        |             |                        |           | Cần người đo                                 |

Cách đo trên điện thoại: `pnpm dev`, mở `http://<ip-máy>:3000/dev/sandbox` từ điện thoại cùng mạng
Wi-Fi (mức chất lượng tự chọn "thấp" trên thiết bị cảm ứng). Đi bộ qua khu nhà, rồi lái ô tô trong
ít nhất 2 phút, ghi số trên HUD vào bảng trên. Đối tượng `window.__dnwSandbox` (runtime) có thể dùng
từ console để đọc `stats.snapshot()`.

Ghi chú: trình duyệt tích hợp chỉ render khi tab hiển thị; khi tab ẩn `requestAnimationFrame` bị dừng
nên số đo phải lấy lúc tab đang hiển thị.

## WP-02 (prototype multiplayer)

Loadtest: `pnpm loadtest --clients 30 --seconds 20` (30 bot, 5 bot lái xe, server dev trên MacBook Air, cùng máy).

| Chỉ tiêu                 | Kết quả    | Ngưỡng G1  |
| ------------------------ | ---------- | ---------- |
| Tick compute p95         | <= 0.25 ms | <= 10 ms   |
| Tick compute p50         | <= 0.1 ms  |            |
| Băng thông xuống mỗi bot | ~11 KB/s   | <= 30 KB/s |
| Bot bị ngắt              | 0/30       | 0          |

Ghi chú: số tick/giây ~39 vì có hai room (30 bot + người chơi khác vượt sức chứa 30 nên Colyseus tạo room thứ hai).
Bot và server chạy cùng một máy nên chưa phản ánh độ trễ mạng thật; cần đo lại trên staging (T17).

E2E Playwright (`pnpm e2e`, 2 trình duyệt headless): thấy nhau, đồng bộ vị trí, rời room thì biến mất; lên ô tô, lái,
người kia thấy xe chạy, dự đoán không snap lần nào, xuống xe; message lạ bị ngắt kết nối mã 4015.

## Cổng G1

_Chưa đánh giá._ Công cụ đo đã sẵn sàng (T04); cần người chạy trên thiết bị thật và ký kết luận.

### Công cụ: `/dev/bench`

Trang tự động đi bộ dọc đường (qua cầu sông) rồi lái ô tô, có 10 avatar giả chạy trên đường, ghi thời gian
khung hình, draw call, tam giác và bộ nhớ JS (mẫu mỗi 2 s), rồi hiện kết luận so với ngưỡng và xuất JSON.

| Tham số         | Ý nghĩa                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `quality`       | `low` (ngưỡng mobile), `medium`, `high` (ngưỡng desktop). Mặc định tự nhận theo thiết bị |
| `auto=1`        | Tự chạy sau 90 khung hình khởi động                                                      |
| `quick=1`       | Mỗi phase vài giây, chỉ để kiểm tra nhanh, **không dùng để kết luận**                    |
| `bots`          | Số avatar giả (mặc định 10)                                                              |
| `walk`, `drive` | Số giây mỗi phase (mặc định 60 + 60)                                                     |

Ngưỡng: mobile (`low`) FPS TB >= 30 và FPS 5% thấp >= 24; desktop FPS TB >= 45 và 5% thấp >= 30; bộ nhớ JS
tăng <= 10% (so mức tối thiểu phần tư đầu với phần tư cuối, bỏ 15% đầu, để lọc dao động do GC; chỉ Chromium có
`performance.memory`). Kết quả có `env.timeToFirstFrameMs` (từ lúc bắt đầu tải trang tới khung hình đầu) và
`env.transferredKb` (tổng dung lượng tải).

### Quy trình đo trên điện thoại

1. `pnpm dev`, mở `http://<ip-máy>:3000/dev/bench?auto=1&walk=90&drive=90` trên điện thoại cùng Wi-Fi. Để màn hình
   sáng, giữ tab ở phía trước, không chạm màn hình khi đang đo. Chạy lần đầu với cache trống để lấy thời gian vào cảnh.
2. Chờ báo cáo; nhập tên thiết bị, bấm "Sao chép dòng bảng" và dán vào bảng dưới; "Tải JSON" nếu cần lưu.
3. Chạy lại ít nhất 2 lần ("Chạy lại"), lấy lần xấu nhất. Đo thêm với `quality=medium` nếu thiết bị mạnh.
4. Các tiêu chí không đo bằng trang này: tải vào cảnh <= 15 s trên 4G tốt (cache trống) thì dùng
   `timeToFirstFrameMs` + Network throttling của DevTools trên bản `pnpm build && pnpm start`; dự đoán xe với RTT 80 ms
   và chống xuyên tường thì dùng test tự động (`pnpm test`, e2e) và loadtest ở mục WP-02.

### Kết quả G1

| Thiết bị | Preset | FPS TB | FPS 5% thấp | Draw call TB | Tam giác TB | Bộ nhớ tăng | Kết luận |
| -------- | ------ | ------ | ----------- | ------------ | ----------- | ----------- | -------- |

Kết luận G1 (người ký): _chưa_. Nếu không đạt, giảm tải theo thứ tự: tắt bóng, giảm devicePixelRatio, giảm bán kính
chunk, giảm số xe/người chơi được vẽ, giảm tần số patch, sức chứa room 20, đơn giản mesh nhà; rồi đo lại.

## WP-15 (tối ưu hiệu năng)

Các thay đổi đã implement trong T16 (cần đo lại trên thiết bị thật để điền số "trước/sau"):

| Thay đổi | Mô tả | Trước | Sau | Ghi chú |
| -------- | ----- | ----- | --- | ------- |
| Entity render limit | Giới hạn max 15 player / 12 vehicle render trên mobile (preset `low`), 30/20 trên `medium`, 50/30 trên `high` | _chưa đo_ | _chưa đo_ | `quality.ts` → `maxPlayers`/`maxVehicles` |
| Tab visibility pause | Dừng render loop (`frameloop="never"`) khi `document.hidden`; kết nối realtime vẫn giữ | _chưa đo_ | _chưa đo_ | Tiết kiệm pin/CPU khi user chuyển tab |
| WebGL context lost/restored | Overlay thông báo khi mất context; tự khôi phục khi browser restore | N/A | N/A | Tránh màn hình đen không giải thích |
| Device detection cải tiến | Dùng `navigator.hardwareConcurrency` + `deviceMemory` để chọn preset chính xác hơn | _chưa đo_ | _chưa đo_ | `detectQuality()` trong `quality.ts` |
| CI asset budget | `content:build` fail khi GLB > 4 MB, > 50 000 tam giác, hoặc ảnh > 1 MB | N/A | N/A | Override: `CONTENT_BUDGET_GLB_BYTES`, `CONTENT_BUDGET_TRIANGLES`, `CONTENT_BUDGET_IMAGE_BYTES` |

### Ngân sách asset (CI)

| Loại | Giới hạn mặc định | Env override |
| ---- | ----------------- | ------------ |
| GLB (dung lượng) | 4 MB | `CONTENT_BUDGET_GLB_BYTES` |
| GLB (tam giác) | 50 000 | `CONTENT_BUDGET_TRIANGLES` |
| Ảnh WebP | 1 MB | `CONTENT_BUDGET_IMAGE_BYTES` |

### Thiết bị đã đo (WP-15)

| Thiết bị | Hệ điều hành | Trình duyệt | Preset | FPS TB | FPS 5% thấp | Draw call | Tam giác | Ghi chú |
| -------- | ------------ | ----------- | ------ | ------ | ----------- | --------- | -------- | ------- |
| _chưa đo_ | | | | | | | | Cần người đo trên thiết bị thật |

### Quy trình đo WP-15

1. `pnpm dev`, mở `/dev/bench?auto=1&walk=90&drive=90` trên thiết bị thật.
2. Chạy với nội dung thật (map han-river-core, avatar, xe, địa danh).
3. Ghi số vào bảng trên; so sánh với baseline WP-01.
4. Kiểm tra bộ nhớ: đi/lái qua mọi chunk 3 lần, đảm bảo không tăng liên tục.
5. Kiểm tra tab visibility: chuyển tab sang chỗ khác 30 s, quay lại — render phải resume ngay.
