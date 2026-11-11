import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Colyseus gọi process.send() (tích hợp pm2) nên không chạy được trong child process của pool "forks".
    pool: "threads",
  },
});
