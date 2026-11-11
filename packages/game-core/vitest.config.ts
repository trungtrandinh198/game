import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "src/movement/**",
        "src/collision/**",
        "src/vehicle/**",
        "src/surface/**",
        "src/geo/**",
      ],
      exclude: ["src/**/*.test.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
