import { expect, test } from "@playwright/test";

test("bench quick tự chạy hết lộ trình và sinh báo cáo", async ({ page }) => {
  await page.goto("/dev/bench?auto=1&quick=1&quality=low&bots=10&walk=6&drive=10");

  const report = page.getByTestId("bench-report");
  await expect(report).toBeVisible({ timeout: 90_000 });

  const data = await page.evaluate(() => {
    const bench = (
      window as unknown as { __dnwBench: { runner: { report: unknown; laps: number } } }
    ).__dnwBench;
    return bench.runner.report as {
      schemaVersion: number;
      overall: { frames: number; avg: number };
      phases: { name: string; frames: number }[];
      render: { callsAvg: number; trianglesAvg: number };
      env: { timeToFirstFrameMs: number | null; quality: string };
    };
  });

  expect(data.schemaVersion).toBe(1);
  expect(data.phases.map((p) => p.name)).toEqual(["walk", "drive"]);
  expect(data.overall.frames).toBeGreaterThan(30);
  expect(data.overall.avg).toBeGreaterThan(0);
  // 10 avatar giả cộng thế giới tĩnh phải tạo ra ít nhất vài chục draw call
  expect(data.render.callsAvg).toBeGreaterThan(20);
  expect(data.render.trianglesAvg).toBeGreaterThan(1000);
  expect(data.env.quality).toBe("low");
  expect(data.env.timeToFirstFrameMs).toBeGreaterThan(0);
});
