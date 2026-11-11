"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ChunkLoader, disposeChunk, type LoadedChunk } from "./world/ChunkLoader";

interface Status {
  state: "loading" | "ready" | "error";
  loaded: number;
  total: number;
  triangles: number;
  bytes: number;
  message?: string;
}

/** Bay tự do: kéo chuột để xoay, WASD di chuyển, Q/E lên xuống, Shift chạy nhanh. */
function FlyControls({ start }: { start: THREE.Vector3 }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: -0.85 });

  useEffect(() => {
    camera.position.copy(start);
    const el = gl.domElement;
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const move = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      look.current.yaw -= e.movementX * 0.004;
      look.current.pitch = Math.max(-1.5, Math.min(1.5, look.current.pitch - e.movementY * 0.004));
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("pointermove", move);
    };
  }, [camera, gl, start]);

  useFrame((_, delta) => {
    const { yaw, pitch } = look.current;
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    const k = keys.current;
    const speed = (k.has("ShiftLeft") ? 120 : 40) * delta;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (k.has("KeyW")) camera.position.addScaledVector(forward, speed);
    if (k.has("KeyS")) camera.position.addScaledVector(forward, -speed);
    if (k.has("KeyD")) camera.position.addScaledVector(right, speed);
    if (k.has("KeyA")) camera.position.addScaledVector(right, -speed);
    if (k.has("KeyE")) camera.position.y += speed;
    if (k.has("KeyQ")) camera.position.y = Math.max(2, camera.position.y - speed);
  });
  return null;
}

function Chunks({ indexUrl, onStatus }: { indexUrl: string; onStatus: (s: Status) => void }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    let cancelled = false;
    const loader = new ChunkLoader();
    const loaded: LoadedChunk[] = [];
    (async () => {
      try {
        const index = await loader.loadIndex(indexUrl);
        const status: Status = {
          state: "loading",
          loaded: 0,
          total: index.chunks.length,
          triangles: 0,
          bytes: 0,
        };
        onStatus({ ...status });
        await Promise.all(
          index.chunks.map(async (c) => {
            const chunk = await loader.loadChunk(c.code);
            if (cancelled) return disposeChunk(chunk);
            loaded.push(chunk);
            scene.add(chunk.group);
            status.loaded++;
            status.triangles += chunk.manifest.stats.triangleCount;
            status.bytes += c.sizeBytes;
            onStatus({ ...status });
          }),
        );
        if (!cancelled) onStatus({ ...status, state: "ready" });
      } catch (e) {
        if (!cancelled)
          onStatus({
            state: "error",
            loaded: 0,
            total: 0,
            triangles: 0,
            bytes: 0,
            message: (e as Error).message,
          });
      }
    })();
    return () => {
      cancelled = true;
      loaded.forEach(disposeChunk);
    };
  }, [indexUrl, scene, onStatus]);
  return null;
}

/** Viewer kiểm tra bản đồ (T09): nạp `index.json` và hiển thị mọi chunk để người duyệt xem trực quan. */
export function MapViewer({ indexUrl }: { indexUrl: string }) {
  const [status, setStatus] = useState<Status>({
    state: "loading",
    loaded: 0,
    total: 0,
    triangles: 0,
    bytes: 0,
  });
  const [start] = useState(() => new THREE.Vector3(0, 420, 380));
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas camera={{ fov: 60, near: 0.5, far: 3000 }}>
        <color attach="background" args={["#a9cbe3"]} />
        <fog attach="fog" args={["#a9cbe3", 600, 1800]} />
        <hemisphereLight args={["#dfeeff", "#6d7a5e", 1.1]} />
        <directionalLight position={[200, 300, 100]} intensity={1.6} />
        <Chunks indexUrl={indexUrl} onStatus={setStatus} />
        <FlyControls start={start} />
      </Canvas>
      <div
        data-testid="map-status"
        data-state={status.state}
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(10,14,20,0.7)",
          color: "#f4f7fb",
          font: "12px/1.5 ui-monospace, monospace",
          padding: "8px 10px",
          borderRadius: 8,
        }}
      >
        <strong>Map viewer</strong> ·{" "}
        {status.state === "error"
          ? `Lỗi: ${status.message}`
          : `${status.loaded}/${status.total} chunk`}
        <div>
          {status.triangles.toLocaleString("vi-VN")} tam giác · {(status.bytes / 1024).toFixed(0)}{" "}
          KB
        </div>
        <div style={{ opacity: 0.7 }}>Kéo chuột: xoay · WASD/QE: bay · Shift: nhanh</div>
        <div style={{ opacity: 0.7 }}>© OpenStreetMap contributors</div>
      </div>
    </div>
  );
}
