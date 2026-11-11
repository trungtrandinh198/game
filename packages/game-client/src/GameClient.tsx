"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLOSE_CODES } from "@dnw/game-config";
import { InputManager } from "./input/InputManager";
import { OnlineSession } from "./net/OnlineSession";
import { QUALITY, detectQuality, type QualityLevel } from "./quality";
import { AvatarModels } from "./render/AvatarModels";
import { OnlineScene, type OnlineRuntime } from "./render/OnlineScene";
import { StatsCollector } from "./stats";
import { DEFAULT_LABELS, type GameLabels } from "./ui/labels";
import { OnlineHud } from "./ui/OnlineHud";
import { TouchControls } from "./ui/TouchControls";
import { ChunkLoader } from "./world/ChunkLoader";
import { ChunkStreamer } from "./world/ChunkStreamer";

export interface JoinTicket {
  ticket: string;
  realtimeUrl: string;
  zoneCode: string;
  protocolVersion: number;
}

export type LoadStage = "map" | "avatars" | "join" | "connect" | "chunks";

export interface GameClientProps {
  /** URL `index.json` của zone (từ `GET /world/zones`). */
  indexUrl: string;
  /** Xin ticket mới (gọi `POST /world/join`); được gọi lại khi quá hạn kết nối lại. */
  join: () => Promise<JoinTicket>;
  /** Danh mục avatar (`GET /avatars`) để nạp model; bỏ qua thì dùng hình tạm. */
  loadAvatars?: () => Promise<{ code: string; modelUrl: string }[]>;
  labels?: GameLabels;
  camera?: { sensitivity: number; invertY: boolean };
  onProgress?: (p: { ratio: number; stage: LoadStage }) => void;
  /** Đã vào thế giới: chunk 3 x 3 quanh điểm spawn đã nạp. */
  onReady?: () => void;
  /** Mất kết nối. `fatal` = bị kick/khóa/đăng nhập nơi khác...: không thử lại; ngược lại đã thử join lại nhưng thất bại. */
  onLost?: (info: { code: number | null; fatal: boolean }) => void;
}

/** Mã đóng kết nối mà client không được tự vào lại (mục 8.11); `SERVER_SHUTDOWN` thì vào lại được. */
const FATAL_CODES = new Set<number>([
  CLOSE_CODES.KICKED,
  CLOSE_CODES.BANNED,
  CLOSE_CODES.DUPLICATE_SESSION,
  CLOSE_CODES.PROTOCOL_MISMATCH,
  CLOSE_CODES.RATE_LIMITED,
]);

const REJOIN_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Màn chơi thật (T11): nạp index, kết nối bằng ticket từ API, nạp chunk 3 x 3 quanh điểm spawn
 * rồi mới báo sẵn sàng; sau đó nạp/giải phóng chunk theo vị trí. Mất kết nối quá hạn thì tự `join` lại.
 */
export function GameClient(props: GameClientProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const input = useMemo(() => new InputManager(), []);
  const stats = useMemo(() => new StatsCollector(), []);
  const [runtime, setRuntime] = useState<OnlineRuntime | null>(null);
  const [quality, setQuality] = useState<QualityLevel>(() => detectQuality());
  const [paused, setPaused] = useState(false);
  const [glLost, setGlLost] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const config = QUALITY[quality];

  // Pause render loop when tab is hidden to save battery/CPU.
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Handle WebGL context lost/restored: show overlay and attempt restore.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onLost = (e: Event) => {
      e.preventDefault(); // allow browser to attempt restore
      setGlLost(true);
    };
    const onRestored = () => setGlLost(false);
    el.addEventListener("webglcontextlost", onLost, false);
    el.addEventListener("webglcontextrestored", onRestored, false);
    return () => {
      el.removeEventListener("webglcontextlost", onLost);
      el.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);

  const { sensitivity = 1, invertY = false } = props.camera ?? {};
  useEffect(() => {
    input.sensitivity = 0.0035 * sensitivity;
    input.invertY = invertY;
  }, [input, sensitivity, invertY]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    input.attach(el);
    return () => input.detach();
  }, [input]);

  useEffect(() => {
    let cancelled = false;
    let watcher: ReturnType<typeof setInterval> | null = null;
    const loader = new ChunkLoader();
    let streamer: ChunkStreamer | null = null;
    let session: OnlineSession | null = null;
    let avatars: AvatarModels | undefined;

    const progress = (ratio: number, stage: LoadStage) =>
      propsRef.current.onProgress?.({ ratio: Math.max(0, Math.min(1, ratio)), stage });

    /** Kết nối bằng ticket mới rồi chờ spawn và chunk quanh đó. */
    const enter = async (report: boolean) => {
      if (!session || !streamer) return;
      if (report) progress(0.4, "join");
      const ticket = await propsRef.current.join();
      if (cancelled) return;
      if (report) progress(0.5, "connect");
      await session.connect(ticket);
      if (cancelled) {
        await session.disconnect();
        return;
      }
      const me = await session.waitForLocal();
      await streamer.ensureAround(me.x, me.z, (r) => report && progress(0.6 + 0.4 * r, "chunks"));
      if (cancelled) return;
      session.inputEnabled = true;
    };

    const rejoin = async (): Promise<boolean> => {
      if (!session) return false;
      for (let attempt = 0; attempt < REJOIN_ATTEMPTS && !cancelled; attempt++) {
        session.status = "reconnecting";
        await sleep(500 * 2 ** attempt);
        try {
          await enter(false);
          return !cancelled;
        } catch {
          // thử lại với khoảng chờ tăng dần
        }
      }
      return false;
    };

    const run = async () => {
      try {
        progress(0.02, "map");
        const index = await loader.loadIndex(propsRef.current.indexUrl);
        if (cancelled) return;
        progress(0.2, "avatars");
        const list = (await propsRef.current.loadAvatars?.().catch(() => [])) ?? [];
        if (list.length > 0) avatars = new AvatarModels(list);

        streamer = new ChunkStreamer(loader, index);
        session = new OnlineSession(streamer.world);
        session.inputEnabled = false;
        const rt: OnlineRuntime = {
          session,
          input,
          stats,
          info: { calls: 0, triangles: 0, geometries: 0, textures: 0 },
          streamer,
          ...(avatars ? { avatars } : {}),
        };
        Object.assign(window, { __dnwOnline: rt });
        setRuntime(rt);

        await enter(true);
        if (cancelled) return;
        progress(1, "chunks");
        propsRef.current.onReady?.();

        let handling = false;
        watcher = setInterval(() => {
          const s = session;
          if (!s || handling || cancelled || s.status !== "closed") return;
          const code = s.closeCode;
          if (code !== null && FATAL_CODES.has(code)) {
            handling = true;
            propsRef.current.onLost?.({ code, fatal: true });
            return;
          }
          handling = true;
          s.inputEnabled = false;
          void rejoin().then((ok) => {
            if (cancelled) return;
            if (ok) handling = false;
            else {
              s.status = "closed";
              propsRef.current.onLost?.({ code, fatal: false });
            }
          });
        }, 500);
      } catch (e) {
        if (!cancelled) {
          const code = (e as { code?: number }).code ?? null;
          propsRef.current.onLost?.({ code, fatal: code !== null && FATAL_CODES.has(code) });
        }
      }
    };
    // Hoãn một nhịp để StrictMode (mount → unmount → mount) không mở hai kết nối cùng lúc.
    const starter = setTimeout(() => void run(), 0);

    return () => {
      cancelled = true;
      clearTimeout(starter);
      if (watcher) clearInterval(watcher);
      void session?.disconnect();
      streamer?.dispose();
      void avatars?.dispose();
      setRuntime(null);
    };
  }, [input, stats]);

  const getTouchStatus = useCallback(
    () => ({
      mounted: runtime?.session.ridden !== undefined,
      canMount: runtime?.session.mountCandidate !== undefined,
    }),
    [runtime],
  );

  return (
    <div
      ref={container}
      data-testid="game-client"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {runtime && (
        <>
          <Canvas
            key={quality}
            dpr={config.dpr}
            shadows={false}
            frameloop={paused ? "never" : "always"}
            gl={{ antialias: config.antialias, powerPreference: "high-performance" }}
            camera={{ fov: 62, near: 0.1, far: 900, position: [0, 4, 0] }}
          >
            <OnlineScene runtime={runtime} quality={quality} />
          </Canvas>
          {glLost && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                fontSize: 18,
                zIndex: 100,
              }}
            >
              WebGL context lost — attempting to restore…
            </div>
          )}
          <OnlineHud
            runtime={runtime}
            quality={quality}
            onQualityChange={setQuality}
            onTogglePrediction={() => {
              runtime.session.predictionEnabled = !runtime.session.predictionEnabled;
            }}
            labels={props.labels ?? DEFAULT_LABELS}
            compact
          />
          <TouchControls input={input} getStatus={getTouchStatus} />
        </>
      )}
    </div>
  );
}
