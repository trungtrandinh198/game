/** Báo cáo benchmark theo mục 17.5 của tài liệu thiết kế (cổng G1). */

export interface Thresholds {
  fpsAvg: number;
  fpsLow5: number;
}

/** Mục tiêu mobile tầm trung: trung bình >= 30, 5% khung chậm nhất >= 24 FPS. */
export const MOBILE_THRESHOLDS: Thresholds = { fpsAvg: 30, fpsLow5: 24 };
/** Mục tiêu desktop phổ thông: 45--60 FPS (mục 12.3). */
export const DESKTOP_THRESHOLDS: Thresholds = { fpsAvg: 45, fpsLow5: 30 };

/** Bộ nhớ JS sau 3 vòng phải quay về mức ban đầu ±10%. */
export const HEAP_GROWTH_LIMIT_PCT = 10;

export interface HeapSample {
  /** Thời điểm tính từ lúc bắt đầu đo (ms). */
  t: number;
  mb: number;
}

export interface PhaseSpan {
  name: string;
  startMs: number;
  endMs: number;
}

export interface BenchSamples {
  /** Thời gian mỗi khung hình (ms) kèm tên phase. */
  frames: { ms: number; phase: string }[];
  calls: number[];
  triangles: number[];
  heap: HeapSample[];
  phases: PhaseSpan[];
  geometriesEnd: number;
  texturesEnd: number;
}

export interface BenchEnv {
  userAgent: string;
  devicePixelRatio: number;
  screen: string;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  gpu: string | null;
  quality: string;
  touch: boolean;
  /** Thời điểm khung hình đầu tiên được vẽ, tính từ lúc bắt đầu tải trang (ms). */
  timeToFirstFrameMs: number | null;
  /** Tổng dung lượng tải qua mạng của các tài nguyên (KB), nếu trình duyệt cho biết. */
  transferredKb: number | null;
  heapSupported: boolean;
}

export interface FpsStats {
  frames: number;
  avg: number;
  /** FPS tại phân vị 95 của thời gian khung hình (5% khung chậm nhất). */
  low5: number;
  min: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface PhaseReport extends FpsStats {
  name: string;
}

export interface HeapTrend {
  baselineMb: number;
  finalMb: number;
  maxMb: number;
  growthPct: number;
  samples: number;
}

export interface Verdict {
  thresholds: Thresholds;
  fpsAvgOk: boolean;
  fpsLow5Ok: boolean;
  heapOk: boolean | null;
  pass: boolean;
}

export interface BenchReport {
  schemaVersion: 1;
  startedAt: string;
  env: BenchEnv;
  durationSeconds: number;
  overall: FpsStats;
  phases: PhaseReport[];
  render: {
    callsAvg: number;
    callsMax: number;
    trianglesAvg: number;
    trianglesMax: number;
    geometries: number;
    textures: number;
  };
  heap: HeapTrend | null;
  verdict: Verdict;
}

export function percentile(sortedAsc: readonly number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  return sortedAsc[Math.min(n - 1, Math.floor(n * p))] ?? 0;
}

export function fpsStats(frameMs: readonly number[]): FpsStats {
  const valid = frameMs.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length === 0)
    return { frames: 0, avg: 0, low5: 0, min: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  const sorted = [...valid].sort((a, b) => a - b);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const p95 = percentile(sorted, 0.95);
  return {
    frames: valid.length,
    avg: 1000 / mean,
    low5: 1000 / p95,
    min: 1000 / (sorted[sorted.length - 1] ?? mean),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: p95,
    p99Ms: percentile(sorted, 0.99),
  };
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const minOf = (xs: readonly number[]) => (xs.length ? Math.min(...xs) : 0);

/**
 * Xu hướng bộ nhớ JS: so mức tối thiểu của phần tư đầu với phần tư cuối sau khi bỏ 15% khởi động.
 * Dùng giá trị tối thiểu để lọc dao động do GC.
 */
export function heapTrend(samples: readonly HeapSample[]): HeapTrend | null {
  if (samples.length < 8) return null;
  const warm = samples.slice(Math.floor(samples.length * 0.15));
  const quarter = Math.max(2, Math.floor(warm.length / 4));
  const baseline = minOf(warm.slice(0, quarter).map((s) => s.mb));
  const final = minOf(warm.slice(-quarter).map((s) => s.mb));
  return {
    baselineMb: baseline,
    finalMb: final,
    maxMb: Math.max(...samples.map((s) => s.mb)),
    growthPct: baseline > 0 ? ((final - baseline) / baseline) * 100 : 0,
    samples: samples.length,
  };
}

export function buildReport(
  samples: BenchSamples,
  env: BenchEnv,
  thresholds: Thresholds,
  startedAt: string,
): BenchReport {
  const overall = fpsStats(samples.frames.map((f) => f.ms));
  const names = [...new Set(samples.frames.map((f) => f.phase))];
  const phases = names.map((name) => ({
    name,
    ...fpsStats(samples.frames.filter((f) => f.phase === name).map((f) => f.ms)),
  }));
  const heap = env.heapSupported ? heapTrend(samples.heap) : null;
  const fpsAvgOk = overall.avg >= thresholds.fpsAvg;
  const fpsLow5Ok = overall.low5 >= thresholds.fpsLow5;
  const heapOk = heap ? heap.growthPct <= HEAP_GROWTH_LIMIT_PCT : null;
  return {
    schemaVersion: 1,
    startedAt,
    env,
    durationSeconds: samples.frames.reduce((a, f) => a + f.ms, 0) / 1000,
    overall,
    phases,
    render: {
      callsAvg: mean(samples.calls),
      callsMax: Math.max(0, ...samples.calls),
      trianglesAvg: mean(samples.triangles),
      trianglesMax: Math.max(0, ...samples.triangles),
      geometries: samples.geometriesEnd,
      textures: samples.texturesEnd,
    },
    heap,
    verdict: {
      thresholds,
      fpsAvgOk,
      fpsLow5Ok,
      heapOk,
      pass: fpsAvgOk && fpsLow5Ok && heapOk !== false,
    },
  };
}

/** Một dòng Markdown để dán vào bảng trong docs/architecture/benchmarks.md. */
export function toMarkdownRow(report: BenchReport, deviceLabel: string): string {
  const o = report.overall;
  const heap = report.heap ? `${report.heap.growthPct.toFixed(1)}%` : "n/a";
  return `| ${deviceLabel} | ${report.env.quality} | ${o.avg.toFixed(0)} | ${o.low5.toFixed(0)} | ${report.render.callsAvg.toFixed(0)} | ${Math.round(report.render.trianglesAvg / 1000)}k | ${heap} | ${report.verdict.pass ? "Đạt" : "Không đạt"} |`;
}
