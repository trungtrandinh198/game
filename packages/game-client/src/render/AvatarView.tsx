import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import type { OnlineSession } from "../net/OnlineSession";
import type { AvatarModels } from "./AvatarModels";
import { NameTag } from "./NameTag";
import { VEHICLE_MODELS } from "./vehicles";

const COLORS = [0xf2a65a, 0x6ab0de, 0x9bd16f, 0xd98ac8, 0xe8d36a, 0x8e9aaf];

function colorFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length] ?? COLORS[0]!;
}

/** Nhân vật placeholder của một người chơi (bản thân hoặc người khác), tự cập nhật từ OnlineSession. */
export function AvatarView({
  session,
  id,
  name,
  avatarCode,
  models,
}: {
  session: OnlineSession;
  id: string;
  name: string;
  avatarCode?: string;
  models?: AvatarModels | undefined;
}) {
  const group = useRef<THREE.Group>(null);
  const color = colorFor(id);
  const [model, setModel] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!models || !avatarCode) return;
    let cancelled = false;
    void models.instance(avatarCode).then((m) => {
      if (!cancelled && m) setModel(m);
    });
    return () => {
      cancelled = true;
      setModel(null);
    };
  }, [models, avatarCode]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const player = session.playerById(id);
    if (!player) {
      g.visible = false;
      return;
    }
    const vehicle = player.vehicleId ? session.vehicleById(player.vehicleId) : undefined;
    if (vehicle) {
      const model = VEHICLE_MODELS[vehicle.kind];
      g.visible = !model.hideRider;
      const [sx, sy, sz] = model.seat;
      const { x, z, rotY } = vehicle.state;
      const sin = Math.sin(rotY);
      const cos = Math.cos(rotY);
      g.position.set(x + sx * cos + sz * sin, sy - 0.75, z - sx * sin + sz * cos);
      g.rotation.y = rotY;
      g.scale.setScalar(0.9);
      return;
    }
    g.visible = true;
    g.scale.setScalar(1);
    g.position.set(player.x, 0, player.z);
    g.rotation.y = player.rotY;
  });

  return (
    <group ref={group}>
      {model ? (
        <primitive object={model} />
      ) : (
        <>
          <mesh position={[0, 0.7, 0]} castShadow>
            <capsuleGeometry args={[0.25, 0.9, 4, 10]} />
            <meshLambertMaterial color={color} />
          </mesh>
          <mesh position={[0, 1.55, 0]} castShadow>
            <sphereGeometry args={[0.2, 12, 10]} />
            <meshLambertMaterial color={0xf6d2b0} />
          </mesh>
          <mesh position={[0, 1.5, 0.2]}>
            <boxGeometry args={[0.08, 0.08, 0.1]} />
            <meshLambertMaterial color={0x333333} />
          </mesh>
        </>
      )}
      {session.sessionId !== id && <NameTag name={name} />}
    </group>
  );
}
