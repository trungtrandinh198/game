"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BenchBots } from "./BenchBots";
import { DEFAULT_BENCH, BenchRunner, type BenchOptions } from "./bench/BenchRunner";
import {
  DESKTOP_THRESHOLDS,
  MOBILE_THRESHOLDS,
  toMarkdownRow,
  type BenchEnv,
  type BenchReport,
} from "./bench/report";
import { QUALITY, detectQuality, type QualityLevel } from "./quality";
import { SandboxScene } from "./render/SandboxScene";
import { createRuntime } from "./runtime";

export interface BenchGameProps {
  quality?: QualityLevel;
  /** Tự chạy sau khi vẽ ổn định (dùng cho script/e2e). */
  auto?: boolean;
  /** Rút ngắn mỗi phase còn vài giây (kiểm tra nhanh, không dùng để kết luận G1). */
  quick?: boolean;
  bots?: number;
  walkSeconds?: number;
  driveSeconds?: number;
}

const WARMUP_FRAMES = 90;

interface GpuInfo {
  renderer: string | null;
}

function readGpu(): GpuInfo {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return { renderer: gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null };
  } catch {
    return { renderer: null };
  }
}

interface PerfMemory {
  usedJSHeapSize: number;
}

function readHeapMb(): number | null {
  const m = (performance as Performance & { memory?: PerfMemory }).memory;
  return m ? m.usedJSHeapSize / 1048576 : null;
}

function transferredKb(): number | null {
  const entries = [
    ...performance.getEntriesByType("navigation"),
    ...performance.getEntriesByType("resource"),
  ] as PerformanceResourceTiming[];
  const total = entries.reduce((a, e) => a + (e.transferSize || 0), 0);
  return total > 0 ? total / 1024 : null;
}

const panel: CSSProperties = {
  position: "absolute",
  zIndex: 5,
  background: "rgba(10, 14, 20, 0.78)",
  color: "#f4f7fb",
  font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
  padding: "10px 12px",
  borderRadius: 8,
};

const button: CSSProperties = {
  font: "inherit",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #5b6b82",
  background: "#1f2a3a",
  color: "inherit",
  cursor: "pointer",
};

function fmt(n: number, digits = 0) {
  return n.toFixed(digits);
}

function ReportView({ report, onRerun }: { report: BenchReport; onRerun: () => void }) {
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState("");
  const json = useMemo(() => JSON.stringify(report, null, 2), [report]);
  const o = report.overall;
  const v = report.verdict;

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(what));
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dnw-bench-${report.env.quality}-${report.startedAt.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-testid="bench-report"
      data-pass={v.pass ? "true" : "false"}
      style={{
        ...panel,
        top: 12,
        left: 12,
        maxWidth: "min(94vw, 420px)",
        maxHeight: "92vh",
        overflow: "auto",
      }}
    >
      <strong style={{ color: v.pass ? "#7ee787" : "#ff7b72" }}>
        G1 hiệu năng: {v.pass ? "ĐẠT" : "KHÔNG ĐẠT"}
      </strong>
      <div>
        FPS trung bình {fmt(o.avg, 1)} (cần ≥ {v.thresholds.fpsAvg}) {v.fpsAvgOk ? "✓" : "✗"}
      </div>
      <div>
        FPS 5% thấp nhất {fmt(o.low5, 1)} (cần ≥ {v.thresholds.fpsLow5}) {v.fpsLow5Ok ? "✓" : "✗"}
      </div>
      <div>
        Khung hình: p50 {fmt(o.p50Ms, 1)} ms, p95 {fmt(o.p95Ms, 1)} ms, p99 {fmt(o.p99Ms, 1)} ms
      </div>
      <div>
        Draw call TB {fmt(report.render.callsAvg)} (max {report.render.callsMax}), tam giác TB{" "}
        {fmt(report.render.trianglesAvg / 1000)}k
      </div>
      <div>
        Bộ nhớ JS:{" "}
        {report.heap
          ? `${fmt(report.heap.baselineMb, 1)} → ${fmt(report.heap.finalMb, 1)} MB (${fmt(report.heap.growthPct, 1)}%) ${v.heapOk ? "✓" : "✗"}`
          : "trình duyệt không hỗ trợ"}
      </div>
      {report.phases.map((p) => (
        <div key={p.name}>
          · {p.name}: {fmt(p.avg, 1)} FPS, 5% thấp {fmt(p.low5, 1)}
        </div>
      ))}
      <div>
        Vào cảnh:{" "}
        {report.env.timeToFirstFrameMs ? `${fmt(report.env.timeToFirstFrameMs)} ms` : "n/a"}, tải{" "}
        {report.env.transferredKb ? `${fmt(report.env.transferredKb)} KB` : "n/a"}
      </div>
      <div style={{ opacity: 0.7 }}>
        {report.env.gpu ?? "GPU n/a"} · dpr {report.env.devicePixelRatio} · {report.env.quality}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <button style={button} onClick={download}>
          Tải JSON
        </button>
        <button style={button} onClick={() => copy(json, "JSON")}>
          Sao chép JSON
        </button>
        <button style={button} onClick={onRerun}>
          Chạy lại
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Tên thiết bị"
          style={{ ...button, flex: 1, minWidth: 0, cursor: "text" }}
        />
        <button
          style={button}
          onClick={() => copy(toMarkdownRow(report, label || "?"), "dòng bảng")}
        >
          Sao chép dòng bảng
        </button>
      </div>
      {copied && <div style={{ opacity: 0.7 }}>Đã sao chép {copied}</div>}
    </div>
  );
}

/** Trang đo hiệu năng cho cổng G1 (T04): lộ trình tự động + người chơi giả + báo cáo JSON. */
export function BenchGame({
  quality: qualityProp,
  auto = false,
  quick = false,
  bots = 10,
  walkSeconds,
  driveSeconds,
}: BenchGameProps) {
  const [quality, setQuality] = useState<QualityLevel>(() => qualityProp ?? detectQuality());
  const [runId, setRunId] = useState(0);
  const runtime = useMemo(() => createRuntime(), [runId]);
  const config = QUALITY[quality];
  const mobile = quality === "low";

  const options = useMemo<BenchOptions>(
    () => ({
      ...DEFAULT_BENCH,
      walkSeconds: walkSeconds ?? (quick ? 8 : DEFAULT_BENCH.walkSeconds),
      driveSeconds: driveSeconds ?? (quick ? 12 : DEFAULT_BENCH.driveSeconds),
      thresholds: mobile ? MOBILE_THRESHOLDS : DESKTOP_THRESHOLDS,
    }),
    [quick, walkSeconds, driveSeconds, mobile],
  );

  const firstFrameMs = useRef<number | null>(null);
  const frames = useRef(0);
  const wantStart = useRef(auto);

  const runner = useMemo(
    () =>
      new BenchRunner(
        runtime,
        {
          now: () => performance.now(),
          readHeapMb,
          quality,
          getEnv: ({ quality: q }): BenchEnv => ({
            userAgent: navigator.userAgent,
            devicePixelRatio: window.devicePixelRatio,
            screen: `${window.screen.width}x${window.screen.height}`,
            hardwareConcurrency: navigator.hardwareConcurrency ?? null,
            deviceMemoryGb:
              (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
            gpu: readGpu().renderer,
            quality: q,
            touch: window.matchMedia?.("(pointer: coarse)").matches ?? false,
            timeToFirstFrameMs: firstFrameMs.current,
            transferredKb: transferredKb(),
            heapSupported: readHeapMb() !== null,
          }),
        },
        options,
      ),
    [runtime, quality, options],
  );

  const [, setTick] = useState(0);
  useEffect(() => {
    Object.assign(window, { __dnwBench: { runner, runtime, start: () => runner.start() } });
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [runner, runtime]);

  const onFrame = useCallback(
    (delta: number) => {
      frames.current++;
      if (firstFrameMs.current === null) firstFrameMs.current = performance.now();
      if (wantStart.current && runner.phase === "idle" && frames.current > WARMUP_FRAMES) {
        wantStart.current = false;
        runner.start();
      }
      runner.onFrame(delta * 1000);
    },
    [runner],
  );

  const start = () => {
    wantStart.current = false;
    runner.start();
  };
  const rerun = () => {
    frames.current = 0;
    wantStart.current = true;
    setRunId((n) => n + 1);
  };
  const changeQuality = (q: QualityLevel) => {
    frames.current = 0;
    firstFrameMs.current = null;
    setQuality(q);
  };

  const phaseLabel = { idle: "Sẵn sàng", walk: "Đi bộ", drive: "Lái ô tô", done: "Xong" }[
    runner.phase
  ];

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", touchAction: "none" }}>
      <Canvas
        key={`${quality}-${runId}`}
        dpr={config.dpr}
        shadows={config.shadows ? "percentage" : false}
        gl={{ antialias: config.antialias, powerPreference: "high-performance" }}
        camera={{ fov: 62, near: 0.1, far: 700, position: [0, 4, 0] }}
      >
        <SandboxScene runtime={runtime} quality={quality} onFrame={onFrame}>
          <BenchBots count={bots} />
        </SandboxScene>
      </Canvas>

      {runner.report ? (
        <ReportView report={runner.report} onRerun={rerun} />
      ) : (
        <div
          data-testid="bench-status"
          data-phase={runner.phase}
          style={{ ...panel, top: 12, left: 12 }}
        >
          <strong>Bench G1</strong> · {phaseLabel}
          {runner.phase === "idle" ? (
            <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
              <select
                value={quality}
                onChange={(e) => changeQuality(e.target.value as QualityLevel)}
                style={button}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
              <button style={button} onClick={start}>
                Bắt đầu
              </button>
            </div>
          ) : (
            <>
              <div>
                Đã chạy {fmt(runner.elapsedSeconds)} s · còn {fmt(runner.remainingSeconds)} s
                (phase)
              </div>
              <div>
                FPS {fmt(runtime.stats.snapshot().fps)} · {runtime.info.calls} draw call
              </div>
              <button style={{ ...button, marginTop: 6 }} onClick={() => runner.stop()}>
                Dừng
              </button>
            </>
          )}
          <div style={{ opacity: 0.7, marginTop: 4 }}>
            {bots} avatar giả · giữ tab ở phía trước, không thao tác khi đang đo
          </div>
        </div>
      )}
    </div>
  );
}
