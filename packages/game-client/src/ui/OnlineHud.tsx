"use client";

import { useEffect, useState } from "react";
import type { QualityLevel } from "../quality";
import type { OnlineRuntime } from "../render/OnlineScene";
import type { FrameStats } from "../stats";
import { DEFAULT_LABELS, type GameLabels } from "./labels";

const panel = {
  position: "absolute",
  zIndex: 5,
  background: "rgba(10, 14, 20, 0.65)",
  color: "#f4f7fb",
  font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
  padding: "8px 10px",
  borderRadius: 8,
  pointerEvents: "none",
} as const;

interface View {
  stats: FrameStats;
  status: string;
  closeCode: number | null;
  rtt: number;
  players: number;
  names: string[];
  corrections: number;
  snaps: number;
  error: number;
  sent: number;
  prediction: boolean;
  prompt: string | null;
  notice: string | null;
  riding: string | null;
  speedKmh: number;
  pos: [number, number];
}

function read(runtime: OnlineRuntime, labels: GameLabels): View {
  const { session } = runtime;
  const candidate = session.mountCandidate;
  const ridden = session.ridden;
  const lastNotice = session.notices[session.notices.length - 1];
  const me = session.local;
  return {
    stats: runtime.stats.snapshot({
      render: { calls: runtime.info.calls, triangles: runtime.info.triangles },
      memory: { geometries: runtime.info.geometries, textures: runtime.info.textures },
    }),
    status: session.status,
    closeCode: session.closeCode,
    rtt: session.stats.rttMs,
    players: [...session.players].length,
    names: [...session.players].map((p) => p.name),
    corrections: session.stats.corrections,
    snaps: session.stats.snaps,
    error: session.stats.lastError,
    sent: session.stats.sent,
    prediction: session.predictionEnabled,
    prompt: ridden
      ? labels.dismountPrompt
      : candidate
        ? labels.mountPrompt.replace("{kind}", labels.kinds[candidate.kind])
        : null,
    notice:
      lastNotice && performance.now() - lastNotice.at < 2500
        ? (labels.notices[lastNotice.code] ?? lastNotice.code)
        : null,
    riding: ridden ? labels.kinds[ridden.kind] : null,
    speedKmh: Math.abs(ridden?.state.speed ?? 0) * 3.6,
    pos: [me?.x ?? 0, me?.z ?? 0],
  };
}

export function OnlineHud({
  runtime,
  quality,
  onQualityChange,
  onTogglePrediction,
  labels = DEFAULT_LABELS,
  compact = false,
}: {
  runtime: OnlineRuntime;
  quality: QualityLevel;
  onQualityChange: (q: QualityLevel) => void;
  onTogglePrediction: () => void;
  labels?: GameLabels;
  /** Chế độ chơi thật: ẩn bảng thông số kỹ thuật, chỉ giữ gợi ý, thông báo và trạng thái kết nối. */
  compact?: boolean;
}) {
  const [view, setView] = useState<View>(() => read(runtime, labels));
  useEffect(() => {
    const id = window.setInterval(() => setView(read(runtime, labels)), 200);
    return () => window.clearInterval(id);
  }, [runtime, labels]);

  const { stats } = view;
  return (
    <>
      {compact ? (
        <div
          style={{ ...panel, top: 8, left: 8, opacity: 0.75, fontSize: 11 }}
          data-testid="online-hud"
        >
          <b data-testid="online-status">{view.status}</b> · ping {view.rtt.toFixed(0)} ms ·{" "}
          <b data-testid="online-players">{view.players}</b>
        </div>
      ) : (
        <>
          <div style={{ ...panel, top: 8, left: 8 }} data-testid="online-hud">
        <div>
          kết nối: <b data-testid="online-status">{view.status}</b> · ping {view.rtt.toFixed(0)} ms
          · người chơi <b data-testid="online-players">{view.players}</b>
        </div>
        <div>
          FPS {stats.fps.toFixed(0)} (5% thấp {stats.fpsLow5.toFixed(0)}) · draw {stats.calls} · tam
          giác {stats.triangles.toLocaleString("vi-VN")}
        </div>
        <div>
          dự đoán: {view.prediction ? "bật" : "tắt"} · lệch {view.error.toFixed(2)} m · mượt{" "}
          {view.corrections} · snap {view.snaps} · gửi {view.sent}
        </div>
        <div>
          x {view.pos[0].toFixed(1)}, z {view.pos[1].toFixed(1)}
          {view.riding ? ` · ${view.riding} ${view.speedKmh.toFixed(0)} km/h` : ""}
        </div>
        <div style={{ opacity: 0.8 }}>{view.names.join(", ")}</div>
      </div>

      <div style={{ ...panel, top: 8, right: 8, pointerEvents: "auto" }}>
        <label>
          Chất lượng:{" "}
          <select value={quality} onChange={(e) => onQualityChange(e.target.value as QualityLevel)}>
            <option value="low">thấp</option>
            <option value="medium">trung bình</option>
            <option value="high">cao</option>
          </select>
        </label>
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={onTogglePrediction}>
            {view.prediction ? "Tắt" : "Bật"} dự đoán
          </button>
        </div>
        <div style={{ marginTop: 6, opacity: 0.85 }}>
          WASD · Shift chạy · chuột phải xoay · F lên/xuống xe · Space phanh tay
        </div>
      </div>
        </>
      )}

      {view.prompt && (
        <div
          style={{
            ...panel,
            bottom: 120,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 15,
          }}
        >
          {view.prompt}
        </div>
      )}
      {view.notice && (
        <div
          style={{ ...panel, top: "18%", left: "50%", transform: "translateX(-50%)", fontSize: 15 }}
        >
          {view.notice}
        </div>
      )}
      {(view.status === "reconnecting" || view.status === "closed") && (
        <div
          data-testid="online-banner"
          style={{
            ...panel,
            top: "40%",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 16,
            textAlign: "center",
          }}
        >
          {view.status === "reconnecting"
            ? labels.reconnecting
            : (view.closeCode !== null && labels.closes[view.closeCode]) || labels.disconnected}
        </div>
      )}
    </>
  );
}
