import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import type { VehicleKind } from "@dnw/game-config";

/** Phần tối thiểu của một xe mà VehicleView cần để vẽ (SandboxVehicle và RenderVehicle đều thỏa). */
export interface VehicleViewModel {
  kind: VehicleKind;
  state: { x: number; z: number; rotY: number; steer: number };
  roll: number;
}

interface BoxSpec {
  size: [number, number, number];
  pos: [number, number, number];
  color: number;
}

interface WheelSpec {
  pos: [number, number, number];
  radius: number;
  width: number;
  steer: boolean;
}

export interface VehicleModelSpec {
  boxes: BoxSpec[];
  wheels: WheelSpec[];
  /** Vị trí ghế người lái theo hệ của xe (z hướng về phía trước). */
  seat: [number, number, number];
  hideRider: boolean;
}

/** Mô hình placeholder dựng từ khối hộp; model thật sẽ thay bằng GLB ở T08/T12. */
export const VEHICLE_MODELS: Record<VehicleKind, VehicleModelSpec> = {
  bicycle: {
    boxes: [
      { size: [0.05, 0.05, 1.0], pos: [0, 0.65, 0], color: 0x2a6f4f },
      { size: [0.5, 0.04, 0.04], pos: [0, 1.0, 0.5], color: 0x222222 },
      { size: [0.12, 0.05, 0.22], pos: [0, 0.9, -0.3], color: 0x222222 },
    ],
    wheels: [
      { pos: [0, 0.35, 0.55], radius: 0.35, width: 0.05, steer: true },
      { pos: [0, 0.35, -0.55], radius: 0.35, width: 0.05, steer: false },
    ],
    seat: [0, 0.9, -0.3],
    hideRider: false,
  },
  motorbike: {
    boxes: [
      { size: [0.35, 0.5, 1.1], pos: [0, 0.7, 0], color: 0xc23b22 },
      { size: [0.3, 0.1, 0.6], pos: [0, 1.0, -0.2], color: 0x1b1b1b },
      { size: [0.7, 0.05, 0.05], pos: [0, 1.15, 0.55], color: 0x222222 },
    ],
    wheels: [
      { pos: [0, 0.4, 0.65], radius: 0.4, width: 0.12, steer: true },
      { pos: [0, 0.4, -0.65], radius: 0.4, width: 0.12, steer: false },
    ],
    seat: [0, 1.0, -0.2],
    hideRider: false,
  },
  car: {
    boxes: [
      { size: [1.8, 0.7, 4.2], pos: [0, 0.65, 0], color: 0x2d5fa8 },
      { size: [1.6, 0.6, 2.2], pos: [0, 1.3, -0.2], color: 0x1f2f4a },
    ],
    wheels: [
      { pos: [0.95, 0.4, 1.4], radius: 0.4, width: 0.25, steer: true },
      { pos: [-0.95, 0.4, 1.4], radius: 0.4, width: 0.25, steer: true },
      { pos: [0.95, 0.4, -1.4], radius: 0.4, width: 0.25, steer: false },
      { pos: [-0.95, 0.4, -1.4], radius: 0.4, width: 0.25, steer: false },
    ],
    seat: [0.4, 0.9, 0.2],
    hideRider: true,
  },
};

const MAX_VISUAL_STEER = 0.5;

/** Vẽ một xe và tự cập nhật theo trạng thái mô phỏng mỗi khung hình. */
export function VehicleView({ vehicle }: { vehicle: VehicleViewModel }) {
  const spec = VEHICLE_MODELS[vehicle.kind];
  const group = useRef<THREE.Group>(null);
  const steerGroups = useRef<(THREE.Group | null)[]>([]);
  const rollGroups = useRef<(THREE.Group | null)[]>([]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { x, z, rotY, steer } = vehicle.state;
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    spec.wheels.forEach((wheel, i) => {
      const steerGroup = steerGroups.current[i];
      const rollGroup = rollGroups.current[i];
      if (steerGroup && wheel.steer) steerGroup.rotation.y = -steer * MAX_VISUAL_STEER;
      if (rollGroup) rollGroup.rotation.x = vehicle.roll / wheel.radius;
    });
  });

  return (
    <group ref={group}>
      {spec.boxes.map((box, i) => (
        <mesh key={`b${i}`} position={box.pos} castShadow>
          <boxGeometry args={box.size} />
          <meshLambertMaterial color={box.color} />
        </mesh>
      ))}
      {spec.wheels.map((wheel, i) => (
        <group key={`w${i}`} position={wheel.pos}>
          <group
            ref={(el) => {
              steerGroups.current[i] = el;
            }}
          >
            <group
              ref={(el) => {
                rollGroups.current[i] = el;
              }}
            >
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[wheel.radius, wheel.radius, wheel.width, 14]} />
                <meshLambertMaterial color={0x1a1a1a} />
              </mesh>
              <mesh position={[0, wheel.radius * 0.75, 0]}>
                <boxGeometry args={[wheel.width * 1.2, wheel.radius * 0.35, wheel.radius * 0.35]} />
                <meshLambertMaterial color={0xdddddd} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}
