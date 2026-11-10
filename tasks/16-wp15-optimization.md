# T16 -- WP-15: Tối ưu hiệu năng

| | |
|---|---|
| Thứ tự | 16 / 18 |
| Cỡ | M |
| Phụ thuộc | T12, T13 |
| Song song với | T14, T15, T17 |
| Người làm | Agent làm, **người đo trên thiết bị thật** |
| Đọc trước | Mục 12.1--12.3, 16.10, 16.11, 17.5 |

## Mục tiêu

Đạt ngưỡng hiệu năng trên điện thoại với bản đồ, người chơi, xe và địa danh thật (không còn placeholder).

## Việc cần làm

- [ ] Đo lại toàn bộ theo mục 17.5 với nội dung thật; ghi baseline vào `docs/architecture/benchmarks.md`.
- [ ] LOD cho công trình và model địa danh/xe (dùng `model.lod1.glb`), instancing cho cây/đèn/xe đậu, hạn chế draw call theo ngân sách 16.10.
- [ ] Texture KTX2/Basis cho model và ảnh địa danh dạng WebP/AVIF phù hợp; kiểm tra `content:build` áp dụng đúng.
- [ ] Tự nhận diện cấu hình thiết bị (ví dụ `navigator.hardwareConcurrency`, `detect-gpu`) để chọn preset chất lượng thấp/trung/cao, cho người chơi đổi tay trong cài đặt.
- [ ] Giảm bóng đổ trên mobile, bỏ bóng nếu cần; giới hạn `devicePixelRatio`; baked lighting cho tĩnh nếu phù hợp.
- [ ] Giới hạn số người chơi và xe render theo ngân sách (mobile 15 người, 12 xe).
- [ ] Dừng/giảm vòng render khi tab ẩn hoặc mất focus; vẫn giữ kết nối hợp lý.
- [ ] Giải phóng bộ nhớ khi chuyển chunk; kiểm tra rò bộ nhớ khi đi/lái qua mọi chunk 3 lần.
- [ ] Xử lý `webglcontextlost`/`restored` (khôi phục hoặc tải lại có thông báo).
- [ ] Ngân sách trong CI: `content:build` và `map:build` thất bại khi vượt giới hạn dung lượng/tam giác.
- [ ] Đo và tối ưu thời gian vào game (cache lạnh), kích thước tải ban đầu <= 8 MB (mobile).

## Sản phẩm bàn giao

Thay đổi trong `packages/game-client`, `tools/content-cli`, `tools/map-pipeline`; báo cáo "trước/sau" trong `benchmarks.md`; danh sách thiết bị đã đo.

## Tiêu chí hoàn thành

-   Đạt mục tiêu 12.3 và toàn bộ ngưỡng 17.5 trên thiết bị đã chọn ở T04 (hoặc ngoại lệ ghi rõ có chữ ký).
-   Bộ nhớ không tăng liên tục khi đi qua nhiều chunk.
-   Có số đo trước/sau cho từng thay đổi lớn (để biết tối ưu nào đáng giá).
-   CI chặn asset vượt ngân sách.

## Kiểm tra

```bash
pnpm content:validate && pnpm map:build --zone han-river-core
# mở /dev/bench trên thiết bị thật, xuất JSON, điền benchmarks.md
pnpm --filter game-client test
```

## Ngoài phạm vi

Thêm tính năng mới, mở rộng bản đồ.

## Bàn giao cho task sau

T18 dùng báo cáo hiệu năng cho nghiệm thu.
