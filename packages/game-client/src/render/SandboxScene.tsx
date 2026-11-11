import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { VehicleKind } from "@dnw/game-config";
import { QUALITY, type QualityLevel } from "../quality";
import type { SandboxRuntime } from "../runtime";
import { WATER, WORLD_HALF_SIZE, type BuildingSpec, type SandboxWorld } from "@dnw/game-core";
import { PlayerView } from "./PlayerView";
import { VehicleView } from "./vehicles";

const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const CAMERA_DISTANCE: Record<VehicleKind | "foot", number> = {
  foot: 5,
  bicycle: 5.5,
  motorbike: 6.5,
  car: 9,
};

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function Buildings({ buildings, shadows }: { buildings: BuildingSpec[]; shadows: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    buildings.forEach((b, i) => {
      matrix.compose(
        new THREE.Vector3(b.x, b.h / 2, b.z),
        new THREE.Quaternion(),
        new THREE.Vector3(b.w, b.h, b.d),
      );
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.setHex(b.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [buildings]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, buildings.length]}
      castShadow={shadows}
      receiveShadow={shadows}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

export function StaticWorld({ world, shadows }: { world: SandboxWorld; shadows: boolean }) {
  const span = WORLD_HALF_SIZE * 2;
  const leftWidth = WATER.minX + WORLD_HALF_SIZE;
  const rightWidth = WORLD_HALF_SIZE - WATER.maxX;
  const waterWidth = WATER.maxX - WATER.minX;
  const waterCenter = (WATER.minX + WATER.maxX) / 2;

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <meshLambertMaterial color={0x7c8a6c} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(-WORLD_HALF_SIZE + WATER.minX) / 2, 0, 0]}
        receiveShadow={shadows}
      >
        <planeGeometry args={[leftWidth, span]} />
        <meshLambertMaterial color={0x9aa88a} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(WATER.maxX + WORLD_HALF_SIZE) / 2, 0, 0]}
        receiveShadow={shadows}
      >
        <planeGeometry args={[rightWidth, span]} />
        <meshLambertMaterial color={0x9aa88a} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[waterCenter, -0.25, 0]}>
        <planeGeometry args={[waterWidth, span]} />
        <meshLambertMaterial color={0x2f6f9f} />
      </mesh>

      {/* vỉa hè rồi mặt đường (đường chữ thập, trục ngang đi qua cầu) */}
      <mesh position={[0, 0.01, 0]} receiveShadow={shadows}>
        <boxGeometry args={[span, 0.02, 16]} />
        <meshLambertMaterial color={0xb8b2a6} />
      </mesh>
      <mesh position={[0, 0.01, 0]} receiveShadow={shadows}>
        <boxGeometry args={[16, 0.02, span]} />
        <meshLambertMaterial color={0xb8b2a6} />
      </mesh>
      <mesh position={[0, 0.03, 0]} receiveShadow={shadows}>
        <boxGeometry args={[span, 0.04, 12]} />
        <meshLambertMaterial color={0x3b3b3f} />
      </mesh>
      <mesh position={[0, 0.03, 0]} receiveShadow={shadows}>
        <boxGeometry args={[12, 0.04, span]} />
        <meshLambertMaterial color={0x3b3b3f} />
      </mesh>

      {/* lan can cầu */}
      {[-6, 6].map((z) => (
        <mesh key={z} position={[waterCenter, 0.5, z]} castShadow={shadows}>
          <boxGeometry args={[waterWidth, 1, 0.2]} />
          <meshLambertMaterial color={0x8a8f98} />
        </mesh>
      ))}

      <Buildings buildings={world.buildings} shadows={shadows} />
    </>
  );
}

/** Toàn bộ nội dung cảnh: thế giới, nhân vật, xe, ánh sáng, vòng lặp mô phỏng và camera. */
export function SandboxScene({
  runtime,
  quality,
  onFrame,
  children,
}: {
  runtime: SandboxRuntime;
  quality: QualityLevel;
  /** Gọi mỗi khung hình trước khi mô phỏng (dùng cho bench). `delta` tính bằng giây. */
  onFrame?: (delta: number) => void;
  children?: ReactNode;
}) {
  const config = QUALITY[quality];
  const { camera, gl } = useThree();
  const light = useRef<THREE.DirectionalLight>(null);
  const accumulator = useRef(0);
  const camera3 = useMemo(
    () => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false }),
    [],
  );

  useFrame((_, delta) => {
    const { sim, input, stats } = runtime;
    stats.push(delta * 1000);
    runtime.info.calls = gl.info.render.calls;
    runtime.info.triangles = gl.info.render.triangles;
    runtime.info.geometries = gl.info.memory.geometries;
    runtime.info.textures = gl.info.memory.textures;
    onFrame?.(delta);

    const dt = Math.min(delta, 0.1);
    if (input.consumeInteract()) sim.interact();

    const snap = input.snapshot();
    const controls = { ...snap, yaw: input.cameraYaw };
    accumulator.current += dt;
    let steps = 0;
    while (accumulator.current >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      sim.step(FIXED_DT, controls);
      accumulator.current -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator.current = 0;

    const focus = sim.focus;
    const mounted = sim.mountedVehicle;

    if (mounted && performance.now() - input.lastLookAt > 1500 && Math.abs(focus.speed) > 1) {
      const target = focus.speed >= 0 ? focus.rotY : focus.rotY + Math.PI;
      input.cameraYaw += wrapAngle(target - input.cameraYaw) * (1 - Math.exp(-2 * dt));
    }

    const distance = CAMERA_DISTANCE[mounted?.kind ?? "foot"];
    const pitch = input.cameraPitch;
    const yaw = input.cameraYaw;
    const height = mounted ? 1.6 : 1.4;
    camera3.look.set(focus.x, height, focus.z);
    const horizontal = distance * Math.cos(pitch);
    const desired = new THREE.Vector3(
      focus.x - Math.sin(yaw) * horizontal,
      height + distance * Math.sin(pitch),
      focus.z - Math.cos(yaw) * horizontal,
    );
    if (!camera3.ready) {
      camera3.pos.copy(desired);
      camera3.ready = true;
    } else {
      camera3.pos.lerp(desired, 1 - Math.exp(-14 * dt));
    }
    camera.position.copy(camera3.pos);
    camera.lookAt(camera3.look);

    const lamp = light.current;
    if (lamp) {
      lamp.position.set(focus.x + 40, 70, focus.z + 25);
      lamp.target.position.set(focus.x, 0, focus.z);
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
      <StaticWorld world={runtime.sim.world} shadows={config.shadows} />
      {runtime.sim.vehicles.map((v) => (
        <VehicleView key={v.id} vehicle={v} />
      ))}
      <PlayerView runtime={runtime} />
      {children}
    </>
  );
}
