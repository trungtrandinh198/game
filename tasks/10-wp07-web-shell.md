# T10 -- WP-07: Web shell và giao diện xác thực

| | |
|---|---|
| Thứ tự | 10 / 18 |
| Cỡ | L |
| Phụ thuộc | T06, T07 |
| Song song với | T08, T09 |
| Người làm | Agent |
| Đọc trước | Mục 2.2, 2.3, 3.1, 5.5 (Web), 10, 11.1, 13.3, 15.5, 9.6--9.8 |

## Mục tiêu

Website Next.js song ngữ có đầy đủ luồng người chơi từ đăng ký đến vào được trang chơi (chưa kết nối game thật).

## Việc cần làm

- [ ] Hoàn thiện `apps/web` (App Router) với Tailwind + shadcn/ui, `next-intl` (`/vi`, `/en`, mặc định `vi`), TanStack Query, react-hook-form + zod, Zustand cho UI state.
- [ ] `messages/vi.json`, `messages/en.json`; script kiểm tra hai file có **cùng bộ khóa**.
- [ ] `lib/api-client.ts`: fetch có kiểu (sinh từ OpenAPI hoặc zod dùng chung), tự gắn `X-DNW-CSRF: 1`, ánh xạ mã lỗi ở 9.6 sang thông báo đã bản địa hóa.
- [ ] Trang: chủ (giới thiệu, chọn ngôn ngữ, nút vào), đăng ký (đồng ý điều khoản), đăng nhập, xác minh email, quên/đặt lại mật khẩu, chọn nhân vật (nam/nữ, thumbnail và xem trước 3D nếu có, tên hiển thị), hồ sơ/cài đặt (ngôn ngữ, độ nhạy camera, đảo trục), đăng xuất.
- [ ] Màn hình loading (tên khu vực, thanh tiến trình, trạng thái tải) và màn hình lỗi/mất kết nối.
- [ ] Trang `play` chỉ nạp game bằng `dynamic(..., { ssr: false })`; chặn truy cập nếu chưa đăng nhập hoặc chưa có nhân vật (chuyển đúng trang).
- [ ] Màn hình hướng dẫn điều khiển lần đầu, có thể ẩn/hiện (3.1), gồm phần lái xe.
- [ ] Trang `legal/privacy`, `legal/terms`, `legal/credits` (nội dung placeholder, credits đọc từ `CREDITS.md`).
- [ ] Giao diện mobile: tránh vùng tai thỏ/gesture, hỗ trợ ngang/dọc.
- [ ] Cơ bản về trợ năng: nhãn form, focus, tương phản.

## Sản phẩm bàn giao

`apps/web/src/**`, `messages/*.json`, script kiểm tra khóa i18n, test e2e.

## Tiêu chí hoàn thành

-   Playwright: đăng ký, lấy email từ Mailpit (API của Mailpit), xác minh, đăng nhập, chọn nhân vật, tới trang `play`; đổi ngôn ngữ đổi toàn bộ giao diện.
-   Script i18n thất bại nếu thiếu khóa ở một trong hai ngôn ngữ.
-   Người chưa đăng nhập vào `play` bị chuyển về đăng nhập; chưa có nhân vật bị chuyển về chọn nhân vật.
-   Không có secret hay biến `NEXT_PUBLIC_` chứa bí mật; không có `import` từ `packages/db`.

## Kiểm tra

```bash
pnpm i18n:check
pnpm --filter web test
pnpm e2e -- --grep auth
```

## Ngoài phạm vi

Khu vực `admin` (T14), kết nối game thật (T11), nội dung pháp lý chính thức.

## Bàn giao cho task sau

T11 gắn game thật vào trang `play`; T14 thêm khu vực admin cùng shell này.
