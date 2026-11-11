import { MOVEMENT_STATE, PLAYER_RADIUS, RUN_SPEED, WALK_SPEED } from "@dnw/game-config";
import { resolveCircle } from "../collision/collision";
import type { SimWorld } from "../world";

export interface PlayerSimState {
  x: number;
  z: number;
  rotY: number;
}

export interface PlayerInput {
  /** -1 trái .. 1 phải (D). */
  moveX: number;
  /** -1 lùi .. 1 tiến (W). */
  moveZ: number;
  run: boolean;
  /** Hướng camera; rotY = 0 hướng +Z. */
  yaw: number;
}

export interface PlayerStepResult extends PlayerSimState {
  movementState: number;
}

const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/**
 * Tích phân một bước. Hướng tiến = (sin yaw, cos yaw), hướng phải = (-cos yaw, sin yaw).
 * Vận tốc luôn bị chặn bởi cấu trúc: client không thể đi nhanh hơn RUN_SPEED.
 */
export function stepPlayer(
  state: PlayerSimState,
  input: PlayerInput,
  dt: number,
  world: SimWorld = {},
): PlayerStepResult {
  let mx = finite(input.moveX);
  let mz = finite(input.moveZ);
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const magnitude = Math.min(len, 1);
  if (magnitude < 1e-6) {
    return { x: state.x, z: state.z, rotY: state.rotY, movementState: MOVEMENT_STATE.IDLE };
  }

  const yaw = finite(input.yaw);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const dirX = mz * sin - mx * cos;
  const dirZ = mz * cos + mx * sin;
  const speed = input.run ? RUN_SPEED : WALK_SPEED;

  const totalDist = speed * dt;
  const steps = Math.max(1, Math.min(8, Math.ceil(totalDist / (PLAYER_RADIUS * 0.5))));
  const stepX = (dirX * speed * dt) / steps;
  const stepZ = (dirZ * speed * dt) / steps;

  let x = state.x;
  let z = state.z;
  for (let i = 0; i < steps; i++) {
    let nx = x + stepX;
    let nz = z + stepZ;
    if (world.collision) {
      const r = resolveCircle(world.collision, nx, nz, PLAYER_RADIUS);
      nx = r.x;
      nz = r.z;
    }
    if (world.inBounds && !world.inBounds(nx, nz)) {
      if (world.inBounds(nx, z)) nz = z;
      else if (world.inBounds(x, nz)) nx = x;
      else {
        nx = x;
        nz = z;
      }
    }
    x = nx;
    z = nz;
  }

  const moved = Math.hypot(x - state.x, z - state.z);
  return {
    x,
    z,
    rotY: Math.atan2(dirX, dirZ),
    movementState:
      moved < 1e-6 ? MOVEMENT_STATE.IDLE : input.run ? MOVEMENT_STATE.RUN : MOVEMENT_STATE.WALK,
  };
}
