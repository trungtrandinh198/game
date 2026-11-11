import { useFrame, useThree } from "@react-three/fiber";
import { buildSandboxWorld, type SandboxWorld } from "@dnw/game-core";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { InputManager } from "../input/InputManager";
import type { OnlineSession } from "../net/OnlineSession";
import { QUALITY, type QualityLevel } from "../quality";
import type { StatsCollector } from "../stats";
import type { ChunkStreamer } from "../world/ChunkStreamer";
import type { AvatarModels } from "./AvatarModels";
import { AvatarView } from "./AvatarView";
import { StaticWorld } from "./SandboxScene";
import { VehicleView } from "./vehicles";

export interface OnlineRuntime {
  session: OnlineSession;
  input: InputManager;
  stats: StatsCollector;
  info: { calls: number; triangles: number; geometries: number; textures: number };
  /** Bản đồ thật: nạp chunk theo vị trí. Không có thì dùng thế giới sandbox. */
  streamer?: ChunkStreamer;
  sandbox?: SandboxWorld;
  avatars?: AvatarModels;
}

const CAMERA_DISTANCE = { foot: 5, bicycle: 5.5, motorbike: 6.5, car: 9 } as const;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Danh sách id người chơi/xe thay đổi chậm nên chỉ đọc lại vài lần mỗi giây để dựng/huỷ view. */
function useEntityIds(session: OnlineSession): {
  players: { id: string; name: string; avatarCode: string }[];
  vehicles: string[];
} {
  const [ids, setIds] = useState<{
    players: { id: string; name: string; avatarCode: string }[];
    vehicles: string[];
  }>({
    players: [],
    vehicles: [],
  });
  const signature = useRef("");
  useEffect(() => {
    const read = () => {
      const players = [...session.players].map((p) => ({
        id: p.id,
        name: p.name,
        avatarCode: p.avatarCode,
      }));
      const vehicles = [...session.vehicles].map((v) => v.id);
      const sig = JSON.stringify([players, vehicles]);
      if (sig !== signature.current) {
        signature.current = sig;
        setIds({ players, vehicles });
      }
    };
    read();
    const timer = window.setInterval(read, 250);
    return () => window.clearInterval(timer);
  }, [session]);
  return ids;
}

export function OnlineScene({
  runtime,
  quality,
}: {
  runtime: OnlineRuntime;
  quality: QualityLevel;
}) {
  const { session, input, stats } = runtime;
  const config = QUALITY[quality];
  const { camera, gl } = useThree();
  const light = useRef<THREE.DirectionalLight>(null);
  const cam = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      desired: new THREE.Vector3(),
      ready: false,
    }),
    [],
  );
  const ids = useEntityIds(session);
  const sandbox = useMemo(
    () => (runtime.streamer ? null : (runtime.sandbox ?? buildSandboxWorld())),
    [runtime.streamer, runtime.sandbox],
  );
  const prev = useRef({ x: 0, z: 0, has: false });

  useFrame((_, delta) => {
    stats.push(delta * 1000);
    runtime.info.calls = gl.info.render.calls;
    runtime.info.triangles = gl.info.render.triangles;
    runtime.info.geometries = gl.info.memory.geometries;
    runtime.info.textures = gl.info.memory.textures;

    const dt = Math.min(delta, 0.1);
    const snap = input.snapshot();
    session.setControls({
      moveX: snap.moveX,
      moveZ: snap.moveZ,
      run: snap.run,
      yaw: input.cameraYaw,
      handbrake: snap.handbrake,
    });
    if (input.consumeInteract()) session.requestInteract();
    session.update(dt);

    const me = session.local;
    if (!me) return;
    const ridden = session.ridden;

    if (runtime.streamer) {
      // Hướng di chuyển để tải trước chunk; chỉ tính khi đã dịch đáng kể.
      const dx = me.x - prev.current.x;
      const dz = me.z - prev.current.z;
      const moved = Math.hypot(dx, dz);
      const heading = prev.current.has && moved > 0.01 ? { x: dx / moved, z: dz / moved } : undefined;
      if (!prev.current.has || moved > 0.5) prev.current = { x: me.x, z: me.z, has: true };
      runtime.streamer.update(me.x, me.z, heading);
    }

    if (ridden && performance.now() - input.lastLookAt > 1500 && Math.abs(ridden.state.speed) > 1) {
      const target = ridden.state.speed >= 0 ? ridden.state.rotY : ridden.state.rotY + Math.PI;
      input.cameraYaw += wrapAngle(target - input.cameraYaw) * (1 - Math.exp(-2 * dt));
    }

    const distance = CAMERA_DISTANCE[ridden?.kind ?? "foot"];
    const pitch = input.cameraPitch;
    const yaw = input.cameraYaw;
    const height = ridden ? 1.6 : 1.4;
    cam.look.set(me.x, height, me.z);
    const horizontal = distance * Math.cos(pitch);
    cam.desired.set(
      me.x - Math.sin(yaw) * horizontal,
      height + distance * Math.sin(pitch),
      me.z - Math.cos(yaw) * horizontal,
    );
    if (!cam.ready) {
      cam.pos.copy(cam.desired);
      cam.ready = true;
    } else {
      cam.pos.lerp(cam.desired, 1 - Math.exp(-14 * dt));
    }
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);

    const lamp = light.current;
    if (lamp) {
      lamp.position.set(me.x + 40, 70, me.z + 25);
      lamp.target.position.set(me.x, 0, me.z);
      lamp.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <color attach="background" args={["#a9cbe3"]} />
      <fog attach="fog" args={["#a9cbe3", 120, 420]} />
      <hemisphereLight args={["#dfeeff", "#6d7a5e", 0.8]} />
      <directionalLight
        ref={light}
        intensity={1.5}
        castShadow={config.shadows}
        shadow-mapSize={[config.shadowMapSize, config.shadowMapSize]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
      />
      {sandbox && <StaticWorld world={sandbox} shadows={config.shadows} />}
      {runtime.streamer && <primitive object={runtime.streamer.root} />}
      {ids.vehicles.slice(0, config.maxVehicles).map((id) => (
        <OnlineVehicle key={id} session={session} id={id} />
      ))}
      {ids.players.slice(0, config.maxPlayers).map((p) => (
        <AvatarView
          key={p.id}
          session={session}
          id={p.id}
          name={p.name}
          avatarCode={p.avatarCode}
          models={runtime.avatars}
        />
      ))}
    </>
  );
}

/** Xe lấy trạng thái trực tiếp từ OnlineSession mỗi khung hình (không qua React state). */
function OnlineVehicle({ session, id }: { session: OnlineSession; id: string }) {
  const proxy = useMemo(
    () => ({
      get kind() {
        return session.vehicleById(id)?.kind ?? "car";
      },
      get state() {
        return session.vehicleById(id)?.state ?? { x: 0, z: 0, rotY: 0, speed: 0, steer: 0 };
      },
      get roll() {
        return session.vehicleById(id)?.roll ?? 0;
      },
    }),
    [session, id],
  );
  return <VehicleView vehicle={proxy} />;
}
