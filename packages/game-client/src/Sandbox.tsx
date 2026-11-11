"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QUALITY, detectQuality, type QualityLevel } from "./quality";
import { SandboxScene } from "./render/SandboxScene";
import { createRuntime } from "./runtime";
import { HudOverlay } from "./ui/HudOverlay";
import { TouchControls } from "./ui/TouchControls";

/** Sandbox 3D để đo hiệu năng và thử cảm giác điều khiển (T02). Chỉ render ở client. */
export function Sandbox() {
  const runtime = useMemo(() => createRuntime(), []);
  const [quality, setQuality] = useState<QualityLevel>(() => detectQuality());
  const container = useRef<HTMLDivElement>(null);
  const config = QUALITY[quality];
  const getTouchStatus = useCallback(
    () => ({
      mounted: runtime.sim.mountedId !== null,
      canMount: runtime.sim.mountCandidate !== undefined,
    }),
    [runtime],
  );

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    runtime.input.attach(el);
    // Cho phép script đo/chẩn đoán đọc trạng thái (xem tasks/04-wp03-gate-g1.md).
    Object.assign(window, { __dnwSandbox: runtime });
    return () => runtime.input.detach();
  }, [runtime]);

  useEffect(() => {
    runtime.stats.reset();
  }, [quality, runtime]);

  return (
    <div
      ref={container}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <Canvas
        key={`${quality}`}
        dpr={config.dpr}
        shadows={config.shadows ? "percentage" : false}
        gl={{ antialias: config.antialias, powerPreference: "high-performance" }}
        camera={{ fov: 62, near: 0.1, far: 700, position: [0, 4, 0] }}
      >
        <SandboxScene runtime={runtime} quality={quality} />
      </Canvas>
      <HudOverlay runtime={runtime} quality={quality} onQualityChange={setQuality} />
      <TouchControls input={runtime.input} getStatus={getTouchStatus} />
    </div>
  );
}
