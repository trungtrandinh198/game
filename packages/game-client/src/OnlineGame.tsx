"use client";

import { Canvas } from "@react-three/fiber";
import { buildSandboxWorld } from "@dnw/game-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InputManager } from "./input/InputManager";
import { OnlineSession } from "./net/OnlineSession";
import { QUALITY, detectQuality, type QualityLevel } from "./quality";
import { OnlineScene, type OnlineRuntime } from "./render/OnlineScene";
import { StatsCollector } from "./stats";
import { OnlineHud } from "./ui/OnlineHud";
import { TouchControls } from "./ui/TouchControls";

export interface OnlineGameProps {
  /** Địa chỉ cổng vận hành của realtime server để xin ticket dev. Mặc định cùng host, cổng 2568. */
  opsUrl?: string;
  /** Tên hiển thị và user id dùng khi xin ticket dev (chỉ ngoài production). */
  name?: string;
  userId?: string;
}

interface DevTicket {
  ticket: string;
  realtimeUrl: string;
  zoneCode: string;
  protocolVersion: number;
}

/** Màn chơi nhiều người (dev): xin ticket dev, kết nối room `city` và hiển thị thế giới. Thay bằng luồng join thật ở T11. */
export function OnlineGame({ opsUrl, name, userId }: OnlineGameProps) {
  const runtime = useMemo<OnlineRuntime>(() => {
    const sandbox = buildSandboxWorld();
    return {
      session: new OnlineSession(sandbox),
      sandbox,
      input: new InputManager(),
      stats: new StatsCollector(),
      info: { calls: 0, triangles: 0, geometries: 0, textures: 0 },
    };
  }, []);
  const [quality, setQuality] = useState<QualityLevel>(() => detectQuality());
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const config = QUALITY[quality];

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    runtime.input.attach(el);
    Object.assign(window, { __dnwOnline: runtime });
    return () => runtime.input.detach();
  }, [runtime]);

  useEffect(() => {
    let cancelled = false;
    const base = opsUrl ?? `http://${window.location.hostname}:2568`;
    const query = new URLSearchParams();
    if (name) query.set("name", name);
    if (userId) query.set("user", userId);
    (async () => {
      try {
        const res = await fetch(`${base}/dev/ticket?${query.toString()}`);
        if (!res.ok) throw new Error(`Không xin được ticket (${res.status})`);
        const t = (await res.json()) as DevTicket;
        const realtimeUrl = t.realtimeUrl.replace("localhost", window.location.hostname);
        if (cancelled) return;
        await runtime.session.connect({
          realtimeUrl,
          ticket: t.ticket,
          zoneCode: t.zoneCode,
          protocolVersion: t.protocolVersion,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không kết nối được máy chủ");
      }
    })();
    return () => {
      cancelled = true;
      void runtime.session.disconnect();
    };
  }, [runtime, opsUrl, name, userId]);

  const getTouchStatus = useCallback(
    () => ({
      mounted: runtime.session.ridden !== undefined,
      canMount: runtime.session.mountCandidate !== undefined,
    }),
    [runtime],
  );

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
        key={quality}
        dpr={config.dpr}
        shadows={config.shadows ? "percentage" : false}
        gl={{ antialias: config.antialias, powerPreference: "high-performance" }}
        camera={{ fov: 62, near: 0.1, far: 700, position: [0, 4, 0] }}
      >
        <OnlineScene runtime={runtime} quality={quality} />
      </Canvas>
      <OnlineHud
        runtime={runtime}
        quality={quality}
        onQualityChange={setQuality}
        onTogglePrediction={() => {
          runtime.session.predictionEnabled = !runtime.session.predictionEnabled;
        }}
      />
      <TouchControls input={runtime.input} getStatus={getTouchStatus} />
      {error && (
        <div
          data-testid="online-error"
          style={{
            position: "absolute",
            zIndex: 9,
            top: "40%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#7a1f1f",
            color: "#fff",
            padding: 16,
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
