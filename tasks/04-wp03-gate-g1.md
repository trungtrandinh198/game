# T04 -- WP-03: Cổng kiểm chứng G1

| | |
|---|---|
| Thứ tự | 4 / 18 |
| Cỡ | S |
| Phụ thuộc | T02, T03 |
| Song song với | T05--T10 (không cần chờ) |
| Người làm | **Người quyết định**, agent chuẩn bị công cụ đo |
| Đọc trước | Mục 12.3, 16.10, 17.3, 17.5 |

## Mục tiêu

Quyết định đi tiếp hay điều chỉnh dựa trên số đo thật trên điện thoại, trước khi đầu tư lớn vào tích hợp, admin và nội dung thật.

## Việc agent làm

- [ ] Trang `/dev/bench` chạy một lộ trình tự động (đi bộ qua khu nhiều nhà, rồi lái ô tô) trong 2 phút, ghi FPS trung bình, FPS thấp nhất 5%, draw call, tam giác, bộ nhớ JS; xuất JSON và hiển thị tóm tắt.
- [ ] Chế độ bench có 10 avatar giả (bot nội suy) để giống tải thật.
- [ ] Mẫu bảng kết quả trong `docs/architecture/benchmarks.md`: thiết bị, trình duyệt, preset, kết quả, đạt/không đạt.
- [ ] Script đo thời gian từ bấm vào game đến điều khiển được (cache lạnh) và theo dõi bộ nhớ khi đi vòng qua mọi chunk 3 lần.

## Việc người làm

- [ ] Chọn thiết bị: ít nhất một Android tầm trung và một iPhone vài năm tuổi, thêm một máy desktop phổ thông.
- [ ] Chạy bench và loadtest, điền bảng kết quả.
- [ ] Chơi thử cảm giác lái ba loại xe trên điện thoại; ghi nhận xét về điều khiển cảm ứng.
- [ ] Ghi kết luận **Đạt / Không đạt / Đạt có điều kiện** kèm lý do vào `benchmarks.md`.

## Ngưỡng (mục 17.5)

| Chỉ tiêu | Ngưỡng |
|---|---|
| FPS mobile khi đi bộ và khi lái xe, 3 x 3 chunk, 10 avatar | trung bình >= 30, thấp nhất 5% >= 24 |
| Vào game đến điều khiển được (4G tốt, cache lạnh) | <= 15 giây |
| 30 bot, tick compute p95 | <= 10 ms |
| Băng thông xuống mỗi client, 30 người di chuyển | <= 30 KB/s |
| Độ lệch dự đoán của người lái ô tô, RTT 80 ms giả lập | không giật kéo > 0.25 m kéo dài quá 1 giây |
| Xe ở tốc độ tối đa | không xuyên tường trong 100 lần thử |
| Bộ nhớ sau 3 vòng qua mọi chunk | về mức ban đầu ±10% |

## Nếu không đạt

Giảm theo thứ tự rồi đo lại: tắt bóng đổ, giảm `devicePixelRatio`, giảm bán kính chunk, giảm số xe/người render, giảm patch rate, giảm sức chứa phòng xuống 20, đơn giản hóa mesh nhà. Chỉ tiếp tục T11 khi đạt hoặc người quyết định chấp nhận ngoại lệ bằng văn bản.

## Tiêu chí hoàn thành

-   `benchmarks.md` có kết quả đầy đủ và kết luận do người ký.
-   Danh sách điều chỉnh (nếu có) đã được ghi vào `docs/architecture/assumptions.md` và áp dụng vào cấu hình/ngân sách ở `game-config`.

## Ngoài phạm vi

Tối ưu sâu (làm ở T16).
