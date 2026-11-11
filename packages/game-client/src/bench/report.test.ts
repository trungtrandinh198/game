import { describe, expect, it } from "vitest";
import {
  DESKTOP_THRESHOLDS,
  MOBILE_THRESHOLDS,
  buildReport,
  fpsStats,
  heapTrend,
  percentile,
  toMarkdownRow,
  type BenchEnv,
  type BenchSamples,
} from "./report";

const env: BenchEnv = {
  userAgent: "test",
  devicePixelRatio: 2,
  screen: "390x844",
  hardwareConcurrency: 6,
  deviceMemoryGb: 4,
  gpu: "Test GPU",
  quality: "low",
  touch: true,
  timeToFirstFrameMs: 1200,
  transferredKb: 900,
  heapSupported: true,
};

function samples(frameMs: number[], heap: number[] = []): BenchSamples {
  return {
    frames: frameMs.map((ms, i) => ({ ms, phase: i < frameMs.length / 2 ? "walk" : "drive" })),
    calls: frameMs.map(() => 40),
    triangles: frameMs.map(() => 9000),
    heap: heap.map((mb, i) => ({ t: i * 2000, mb })),
    phases: [],
    geometriesEnd: 47,
    texturesEnd: 2,
  };
}

describe("percentile / fpsStats", () => {
  it("rỗng trả 0", () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(fpsStats([]).frames).toBe(0);
  });

  it("tính FPS trung bình và 5% thấp nhất", () => {
    const frames = [...Array(95).fill(16.67), ...Array(5).fill(50)];
    const s = fpsStats(frames);
    expect(s.frames).toBe(100);
    expect(s.avg).toBeGreaterThan(50);
    expect(s.low5).toBeCloseTo(20, 0);
    expect(s.min).toBeCloseTo(20, 0);
    expect(s.p50Ms).toBeCloseTo(16.67);
  });

  it("bỏ qua giá trị không hợp lệ", () => {
    expect(fpsStats([NaN, -5, 0, 20]).frames).toBe(1);
  });
});

describe("heapTrend", () => {
  it("không đủ mẫu thì trả null", () => {
    expect(heapTrend([{ t: 0, mb: 50 }])).toBeNull();
  });

  it("phẳng (có răng cưa do GC) thì tăng trưởng gần 0", () => {
    const mb = Array.from({ length: 40 }, (_, i) => 60 + (i % 5) * 4);
    const t = heapTrend(mb.map((v, i) => ({ t: i, mb: v })))!;
    expect(Math.abs(t.growthPct)).toBeLessThan(2);
    expect(t.maxMb).toBe(76);
  });

  it("tăng liên tục thì báo tăng trưởng lớn (rò rỉ)", () => {
    const mb = Array.from({ length: 40 }, (_, i) => 60 + i * 2);
    expect(heapTrend(mb.map((v, i) => ({ t: i, mb: v })))!.growthPct).toBeGreaterThan(30);
  });
});

describe("buildReport / verdict", () => {
  it("đạt ngưỡng mobile khi 60 FPS ổn định và bộ nhớ phẳng", () => {
    const r = buildReport(
      samples(Array(600).fill(16.67), Array(30).fill(70)),
      env,
      MOBILE_THRESHOLDS,
      "2026-11-11",
    );
    expect(r.verdict.pass).toBe(true);
    expect(r.phases.map((p) => p.name)).toEqual(["walk", "drive"]);
    expect(r.render).toMatchObject({
      callsAvg: 40,
      trianglesMax: 9000,
      geometries: 47,
      textures: 2,
    });
    expect(r.heap?.growthPct).toBeCloseTo(0);
  });

  it("không đạt khi FPS trung bình thấp", () => {
    const r = buildReport(samples(Array(300).fill(50)), env, MOBILE_THRESHOLDS, "x");
    expect(r.overall.avg).toBeCloseTo(20);
    expect(r.verdict.fpsAvgOk).toBe(false);
    expect(r.verdict.pass).toBe(false);
  });

  it("không đạt khi 5% khung chậm nhất dưới ngưỡng dù trung bình đủ", () => {
    const frames = [...Array(90).fill(16.67), ...Array(10).fill(60)];
    const r = buildReport(samples(frames), env, MOBILE_THRESHOLDS, "x");
    expect(r.verdict.fpsAvgOk).toBe(true);
    expect(r.verdict.fpsLow5Ok).toBe(false);
  });

  it("không đạt khi bộ nhớ tăng quá 10%", () => {
    const heap = Array.from({ length: 40 }, (_, i) => 60 + i * 2);
    const r = buildReport(samples(Array(300).fill(16.67), heap), env, MOBILE_THRESHOLDS, "x");
    expect(r.verdict.heapOk).toBe(false);
    expect(r.verdict.pass).toBe(false);
  });

  it("trình duyệt không hỗ trợ đo bộ nhớ thì bỏ qua tiêu chí này", () => {
    const r = buildReport(
      samples(Array(300).fill(16.67)),
      { ...env, heapSupported: false },
      DESKTOP_THRESHOLDS,
      "x",
    );
    expect(r.heap).toBeNull();
    expect(r.verdict.heapOk).toBeNull();
    expect(r.verdict.pass).toBe(true);
  });

  it("sinh dòng Markdown cho bảng benchmarks", () => {
    const r = buildReport(samples(Array(300).fill(16.67)), env, MOBILE_THRESHOLDS, "x");
    const row = toMarkdownRow(r, "Pixel 7");
    expect(row.startsWith("| Pixel 7 | low | 60 |")).toBe(true);
    expect(row).toContain("Đạt");
  });
});
