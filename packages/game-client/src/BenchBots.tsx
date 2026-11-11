"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { NameTag } from "./render/NameTag";

const COLORS = [0xf2a65a, 0x6ab0de, 0x9bd16f, 0xd98ac8, 0xe8d36a, 0x8e9aaf];

interface Bot {
  name: string;
  color: number;
  /** Tâm quỹ đạo dọc trục X, độ lệch ngang đường, tốc độ (m/s) và nửa chiều dài đoạn đi lại. */
  cx: number;
  z: number;
  speed: number;
  half: number;
  phase: number;
}

function makeBots(count: number): Bot[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Bot ${i + 1}`,
    color: COLORS[i % COLORS.length]!,
    cx: -150 + (i * 300) / Math.max(1, count - 1),
    z: ((i % 5) - 2) * 1.8,
    speed: 2.2 + (i % 4) * 0.9,
    half: 60 + (i % 3) * 20,
    phase: i * 1.7,
  }));
}

function BotView({ bot }: { bot: Bot }) {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    // Đi qua đi lại theo hình tam giác để vận tốc không đổi và không cần trạng thái.
    const period = (4 * bot.half) / bot.speed;
    const u = (((clock.elapsedTime + bot.phase) % period) + period) % period;
    const k = u / period;
    const tri = k < 0.5 ? k * 4 - 1 : 3 - k * 4; // -1..1..-1
    g.position.set(bot.cx + tri * bot.half, 0, bot.z);
    g.rotation.y = k < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0.7, 0]}>
        <capsuleGeometry args={[0.25, 0.9, 4, 10]} />
        <meshLambertMaterial color={bot.color} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshLambertMaterial color={0xf6d2b0} />
      </mesh>
      <NameTag name={bot.name} />
    </group>
  );
}

/** Người chơi giả chạy dọc đường để mô phỏng tải vẽ của phòng đông (mục 17.5: 10 avatar). */
export function BenchBots({ count }: { count: number }) {
  const bots = useMemo(() => makeBots(count), [count]);
  return (
    <>
      {bots.map((b) => (
        <BotView key={b.name} bot={b} />
      ))}
    </>
  );
}
