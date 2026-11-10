# T18 -- WP-17: Sẵn sàng beta

| | |
|---|---|
| Thứ tự | 18 / 18 |
| Cỡ | M |
| Phụ thuộc | T15, T16, T17 |
| Song song với | Không (task cuối) |
| Người làm | Agent chạy kiểm thử và sửa lỗi; **người ký nghiệm thu và pháp lý** |
| Đọc trước | Mục 13.3, 16.12, 17.4, 17.6, 20, 21 |

## Mục tiêu

Chạy toàn bộ nghiệm thu MVP trên staging, xử lý lỗi còn lại, hoàn tất các điều kiện pháp lý/ghi công và chốt có phát hành beta hay không.

## Việc cần làm

- [ ] Hoàn thiện bộ Playwright: đăng ký đến vào game, hai người cùng room, lái xe, địa danh song ngữ, admin, kiểm duyệt, mất mạng/reconnect; chạy ổn định trên staging.
- [ ] Chạy thủ công trên thiết bị thật: Android, iPhone, desktop (Chrome, Safari, Firefox) theo danh sách đã chọn.
- [ ] Thực hiện danh sách nghiệm thu mục 20 từng mục, ghi kết quả, bằng chứng (ảnh, log, số đo) và ngoại lệ vào `docs/product/acceptance-report.md`.
- [ ] Kiểm tra trải nghiệm onboarding với vài người dùng thử (không biết chơi game): ghi quan sát, sửa các điểm vướng chính.
- [ ] Rà `Credits`: ghi công OpenStreetMap ("© OpenStreetMap contributors" kèm liên kết) và mọi asset từ `CREDITS.md`; mỗi ảnh địa danh có nguồn/giấy phép.
- [ ] Trang chính sách quyền riêng tư và điều khoản: nội dung do người/pháp lý cung cấp; hiển thị đúng và có đồng ý khi đăng ký; luồng yêu cầu xóa tài khoản/dữ liệu.
- [ ] Danh sách rủi ro mở (mục 17.4): cập nhật trạng thái từng mục, nêu rõ rủi ro còn lại.
- [ ] Phân loại và sửa lỗi theo mức độ (chặn phát hành / sửa sau).

## Việc của người (agent không tự quyết)

- [ ] Tư vấn pháp lý: giấy phép dữ liệu OSM (ODbL) cho chunk phái sinh, quy định game trực tuyến và dữ liệu cá nhân tại Việt Nam.
- [ ] Duyệt nội dung địa danh và bản dịch lịch sử.
- [ ] Duyệt bảo mật (auth, RBAC, ticket realtime) trước khi mở công khai.
- [ ] Ký quyết định phát hành beta.

## Sản phẩm bàn giao

`docs/product/acceptance-report.md`, bộ e2e hoàn chỉnh, danh sách lỗi và rủi ro mở, bản phát hành beta gắn tag.

## Tiêu chí hoàn thành

-   Mọi mục ở mục 20 đạt hoặc có ngoại lệ ghi rõ lý do và người chấp nhận.
-   Không còn lỗi mức chặn phát hành.
-   Credits/ghi công OSM hiển thị; điều khoản và quyền riêng tư đã được người duyệt.
-   Biên bản duyệt bảo mật và tư vấn pháp lý đã có (hoặc ghi rõ rủi ro chấp nhận).

## Kiểm tra

```bash
pnpm e2e                         # chạy trên staging với E2E_BASE_URL
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Ngoài phạm vi

Tính năng mới, mở rộng bản đồ, chat, hành khách trên xe (thuộc phiên bản sau).
