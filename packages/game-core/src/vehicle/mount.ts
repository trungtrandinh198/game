import { PLAYER_RADIUS, VEHICLE_MOUNT_RANGE_M, type VehiclePhysics } from "@dnw/game-config";
import { pathBlocked, resolveCircle } from "../collision/collision";
import type { SimWorld } from "../world";

export type MountError = "VEHICLE_TOO_FAR" | "VEHICLE_OCCUPIED";

export interface Positioned {
  x: number;
  z: number;
}

export interface MountableVehicle extends Positioned {
  id: string;
  hasDriver: boolean;
}

/** Kiểm tra theo thứ tự của mục 8.13; `tolerance` là dung sai mạng phía server. */
export function checkMount(
  player: Positioned,
  vehicle: MountableVehicle,
  tolerance = 0,
): { ok: true } | { ok: false; code: MountError } {
  if (vehicle.hasDriver) return { ok: false, code: "VEHICLE_OCCUPIED" };
  const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);
  if (distance > VEHICLE_MOUNT_RANGE_M + tolerance) return { ok: false, code: "VEHICLE_TOO_FAR" };
  return { ok: true };
}

/** Xe còn trống gần nhất trong tầm lên xe, hoặc undefined. */
export function nearestMountable<T extends MountableVehicle>(
  player: Positioned,
  vehicles: readonly T[],
): T | undefined {
  let best: T | undefined;
  let bestDistance = Infinity;
  for (const vehicle of vehicles) {
    if (!checkMount(player, vehicle).ok) continue;
    const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);
    if (distance < bestDistance) {
      best = vehicle;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Thử vị trí bên trái, bên phải rồi phía sau xe (cách 1.2--2 m);
 * trả vị trí đầu tiên không va chạm, nằm trong biên và không bị tường chắn giữa xe và điểm đó, hoặc null.
 */
export function findDismountPosition(
  vehicle: Positioned & { rotY: number },
  dimensions: VehiclePhysics["dimensions"],
  world: SimWorld = {},
): Positioned | null {
  const fx = Math.sin(vehicle.rotY);
  const fz = Math.cos(vehicle.rotY);
  const leftX = Math.cos(vehicle.rotY);
  const leftZ = -Math.sin(vehicle.rotY);
  const sideBase = dimensions.width / 2 + PLAYER_RADIUS + 0.3;
  const rearBase = dimensions.length / 2 + PLAYER_RADIUS + 0.3;

  const candidates: Positioned[] = [];
  for (const extra of [0, 0.4, 0.8]) {
    const side = Math.min(2, Math.max(1.2, sideBase + extra));
    candidates.push({ x: vehicle.x + leftX * side, z: vehicle.z + leftZ * side });
    candidates.push({ x: vehicle.x - leftX * side, z: vehicle.z - leftZ * side });
  }
  const rear = Math.min(2.6, Math.max(1.2, rearBase));
  candidates.push({ x: vehicle.x - fx * rear, z: vehicle.z - fz * rear });

  for (const c of candidates) {
    if (world.inBounds && !world.inBounds(c.x, c.z)) continue;
    if (world.collision && resolveCircle(world.collision, c.x, c.z, PLAYER_RADIUS).hit) continue;
    if (world.collision && pathBlocked(world.collision, vehicle.x, vehicle.z, c.x, c.z)) continue;
    return c;
  }
  return null;
}
