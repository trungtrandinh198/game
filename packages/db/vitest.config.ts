import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test chạm database thật qua mạng: chạy tuần tự, timeout rộng.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
