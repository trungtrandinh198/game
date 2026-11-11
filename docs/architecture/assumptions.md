# Giả định đã ghi nhận

Mỗi mục: ngày, task, giả định, lý do.

- 2026-11-11, T01: Máy dev không có Docker và git-lfs nên `compose.dev.yml` và `.gitattributes` (LFS) chưa được chạy thử cục bộ; CI sẽ xác nhận phần Postgres/Redis.
- 2026-11-11, T01: pnpm 12 chặn postinstall mặc định; `pnpm-workspace.yaml` cho phép `esbuild` qua `allowBuilds` (khóa `onlyBuiltDependencies` của bản cũ không còn được dùng).
- 2026-11-11, T03: Colyseus hiện là 0.18 (core 0.18.x, schema 5, client `@colyseus/sdk`), khác 0.16 trong tài liệu gốc: state dùng `schema()`/`t.*`, handler dùng `messages`. Không dùng meta-package `colyseus` vì nó kéo `uWebSockets.js` từ git (pnpm `blockExoticSubdeps` chặn); dùng `@colyseus/core` + `@colyseus/ws-transport`.
- 2026-11-11, T03: Colyseus giữ mã đóng 4000--4010 nên `CLOSE_CODES` đổi thành 4011--4016. Handler dùng `safeParse` thay vì `validate()` vì `validate()` ngắt kết nối ngay lần sai đầu tiên; ta chỉ ngắt sau 10 lần sai/10 giây.
- 2026-11-11, T03: Room dùng `setTimestep` 50 ms kèm bộ tích lũy tự viết (bước cố định `TICK_DT`), không dùng `setFixedTimestep`/`defineInput` của 0.18 để giữ logic dùng chung `game-core`. Nhà máy cho phép thay sau nếu cần.
- 2026-11-11, T03: Ticket dev ký HS256 bằng secret mặc định chỉ khi `NODE_ENV != production`; `allowDevTickets` bị cấm ở production. `jti` dùng một lần lưu trong bộ nhớ (Redis ở T11). Realtime dùng world fixture `sandbox` (trong `game-core`), chưa nạp chunk thật (T11).
- 2026-11-11, T03: Mất kết nối đột ngột được giữ chỗ `RECONNECT_WINDOW_SECONDS` (20 s) qua `onDrop`/`allowReconnection`; chưa có test reconnect tự động (task T11).
- 2026-11-11, T03: `vitest` của realtime dùng pool `threads` vì Colyseus gọi `process.send()` làm hỏng kênh IPC của pool `forks`.
- 2026-11-11, T02: "Bắc" của hệ local là Bắc lưới UTM 49N, lệch Bắc thật khoảng 0.8° tại Đà Nẵng (hội tụ kinh tuyến); chấp nhận được cho game, tất cả dữ liệu dùng cùng phép chiếu nên nhất quán.
- 2026-11-11, T01: Các package dùng nguồn TypeScript trực tiếp (`exports` trỏ `src/index.ts`); `build` của package chỉ chạy `tsc --noEmit`. Khi app Node (api, realtime) cần chạy từ artifact, T06/T03 sẽ thêm bước bundle.
