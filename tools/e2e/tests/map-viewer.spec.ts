import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const built = existsSync(
  fileURLToPath(new URL("../../../dist/maps/zones/han-river-core/v1/index.json", import.meta.url)),
);

test.skip(!built, "cần chạy pnpm map:build --zone han-river-core trước");

test("map viewer nạp đủ chunk của bản build cục bộ", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dev/map-viewer");
  const status = page.getByTestId("map-status");
  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 90_000 });
  await expect(status).toContainText("16/16 chunk");
  await page.screenshot({ path: "test-results/map-viewer.png" });
  expect(errors).toEqual([]);
});
