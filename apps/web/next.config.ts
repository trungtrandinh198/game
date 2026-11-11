import type { NextConfig } from "next";

const apiUrl = process.env["API_INTERNAL_URL"] ?? "http://localhost:4000";

const config: NextConfig = {
  // Các package workspace được dùng trực tiếp dưới dạng mã nguồn TypeScript.
  transpilePackages: ["@dnw/game-client", "@dnw/game-core", "@dnw/game-config", "@dnw/schemas"],
  reactStrictMode: true,
  // Cho phép điện thoại trong cùng mạng LAN mở http://<ip-may>:3000 khi dev (chỉ áp dụng cho `next dev`).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  // Trình duyệt chỉ nói chuyện với cùng origin; Next chuyển tiếp tới API nên cookie phiên và kiểm tra Origin (CSRF) hoạt động không cần CORS.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default config;
