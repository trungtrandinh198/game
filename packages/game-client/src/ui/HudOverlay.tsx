"use client";

import { useEffect, useState } from "react";
import type { QualityLevel } from "../quality";
import type { SandboxRuntime } from "../runtime";
import type { NoticeCode } from "../sim/SandboxSim";
import type { FrameStats } from "../stats";

const NOTICE_TEXT: Record<NoticeCode, string> = {
  VEHICLE_MOUNTED: "Đã lên xe",
  VEHICLE_DISMOUNTED: "Đã xuống xe",
  VEHICLE_TOO_FAST: "Xe còn chạy nhanh, hãy giảm tốc để xuống",
  VEHICLE_NO_DISMOUNT_SPACE: "Không có chỗ để xuống xe",
  VEHICLE_NONE_NEARBY: "Không có xe trống ở gần",
};

const KIND_LABEL = { bicycle: "xe đạp", motorbike: "xe máy", car: "ô tô" } as const;
const NOTICE_MS = 2500;

interface HudState {
  stats: FrameStats;
  speedKmh: number;
  surface: string;
  state: string;
  prompt: string | null;
  notice: string | null;
  collisions: number;
  vehicle: string | null;
  x: number;
  z: number;
}

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

function snapshot(runtime: SandboxRuntime): HudState {
  const { sim } = runtime;
  const vehicle = sim.mountedVehicle;
  const candidate = sim.mountCandidate;
  const noticeAge = sim.notice ? sim.time - sim.notice.at : Infinity;
  const stateName = vehicle
    ? "lái xe"
    : ["đứng yên", "đi bộ", "chạy", "lái xe"][sim.player.movementState];
  return {
    stats: runtime.stats.snapshot({
      render: { calls: runtime.info.calls, triangles: runtime.info.triangles },
      memory: { geometries: runtime.info.geometries, textures: runtime.info.textures },
    }),
    speedKmh: Math.abs(vehicle?.state.speed ?? 0) * 3.6,
    surface: sim.surface,
    state: stateName ?? "",
    prompt: vehicle ? "F: xuống xe" : candidate ? `F: lên ${KIND_LABEL[candidate.kind]}` : null,
    notice: sim.notice && noticeAge * 1000 < NOTICE_MS ? NOTICE_TEXT[sim.notice.code] : null,
    collisions: sim.collisions,
    vehicle: vehicle ? KIND_LABEL[vehicle.kind] : null,
    x: sim.player.x,
    z: sim.player.z,
  };
}

export function HudOverlay({
  runtime,
  quality,
  onQualityChange,
}: {
  runtime: SandboxRuntime;
  quality: QualityLevel;
  onQualityChange: (q: QualityLevel) => void;
}) {
  const [hud, setHud] = useState<HudState>(() => snapshot(runtime));

  useEffect(() => {
    const id = window.setInterval(() => setHud(snapshot(runtime)), 200);
    return () => window.clearInterval(id);
  }, [runtime]);

  const { stats } = hud;
  return (
    <>
      <div style={{ ...panel, top: 8, left: 8 }} data-testid="hud-stats">
        <div>
          FPS {stats.fps.toFixed(0)} (5% thấp {stats.fpsLow5.toFixed(0)}) ·{" "}
          {stats.frameMs.toFixed(1)} ms
        </div>
        <div>
          draw {stats.calls} · tam giác {stats.triangles.toLocaleString("vi-VN")}
        </div>
        <div>
          geo {stats.geometries} · tex {stats.textures}
        </div>
        <div>
          {hud.state}
          {hud.vehicle ? ` (${hud.vehicle}, ${hud.speedKmh.toFixed(0)} km/h)` : ""} · mặt đường:{" "}
          {hud.surface}
        </div>
        <div>
          x {hud.x.toFixed(0)}, z {hud.z.toFixed(0)} · va chạm {hud.collisions}
        </div>
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
        <div style={{ marginTop: 6, opacity: 0.85 }}>
          WASD · Shift chạy · chuột phải xoay · F lên/xuống xe · Space phanh tay
        </div>
      </div>

      {hud.prompt && (
        <div
          style={{
            ...panel,
            bottom: 120,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 15,
          }}
        >
          {hud.prompt}
        </div>
      )}
      {hud.notice && (
        <div
          style={{ ...panel, top: "18%", left: "50%", transform: "translateX(-50%)", fontSize: 15 }}
        >
          {hud.notice}
        </div>
      )}
    </>
  );
}
