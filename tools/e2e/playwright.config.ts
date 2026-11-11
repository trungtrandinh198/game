import { defineConfig } from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";
const opsURL = process.env["E2E_OPS_URL"] ?? "http://localhost:2568";
const apiURL = process.env["E2E_API_URL"] ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    // WebGL phần mềm để chạy được trong headless/CI không có GPU
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  // Chỉ tự khởi động dịch vụ khi chưa chạy và không trỏ tới môi trường ngoài.
  webServer: process.env["E2E_BASE_URL"]
    ? undefined
    : [
        {
          command: "pnpm --filter @dnw/realtime start",
          url: `${opsURL}/healthz`,
          reuseExistingServer: true,
          timeout: 60_000,
          cwd: "../..",
          env: { REDIS_URL: "", MAP_SOURCE: "dist/maps" },
        },
        {
          command: "pnpm --filter @dnw/api start",
          url: `${apiURL}/healthz`,
          reuseExistingServer: true,
          timeout: 60_000,
          cwd: "../..",
          // Không Redis/SMTP: giới hạn tốc độ trong bộ nhớ, thư xem qua /dev/mailbox; bắt buộc xác minh email như production.
          env: {
            REDIS_URL: "",
            SMTP_URL: "",
            REQUIRE_EMAIL_VERIFICATION: "true",
            RATE_LIMIT_SCALE: "100",
            API_PORT: new URL(apiURL).port,
          },
        },
        {
          command: "pnpm --filter @dnw/web dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          cwd: "../..",
        },
      ],
});
