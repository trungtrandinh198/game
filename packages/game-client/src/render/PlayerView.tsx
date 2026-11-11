import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import type { SandboxRuntime } from "../runtime";
import { VEHICLE_MODELS } from "./vehicles";

/** Nhân vật placeholder (capsule + đầu + mũi chỉ hướng +Z). Khi lái xe thì ngồi vào ghế xe. */
export function PlayerView({ runtime }: { runtime: SandboxRuntime }) {
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { sim } = runtime;
    const vehicle = sim.mountedVehicle;
    if (vehicle) {
      const model = VEHICLE_MODELS[vehicle.kind];
      g.visible = !model.hideRider;
      const [sx, sy, sz] = model.seat;
      const { x, z, rotY } = vehicle.state;
      const sin = Math.sin(rotY);
      const cos = Math.cos(rotY);
      // chuyển vị trí ghế (hệ xe, local +X là bên phải của hệ three) sang thế giới
      g.position.set(x + sx * cos + sz * sin, sy - 0.75, z - sx * sin + sz * cos);
      g.rotation.y = rotY;
      g.scale.setScalar(0.9);
      return;
    }
    g.visible = true;
    g.scale.setScalar(1);
    g.position.set(sim.player.x, 0, sim.player.z);
    g.rotation.y = sim.player.rotY;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.9, 4, 10]} />
        <meshLambertMaterial color={0xf2a65a} />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshLambertMaterial color={0xf6d2b0} />
      </mesh>
      <mesh position={[0, 1.5, 0.2]}>
        <boxGeometry args={[0.08, 0.08, 0.1]} />
        <meshLambertMaterial color={0x333333} />
      </mesh>
    </group>
  );
}
