import {
  VEHICLE_COLLISION_SPEED_LOSS,
  VEHICLE_HANDBRAKE_FACTOR,
  VEHICLE_STEER_RESPONSE,
  VEHICLE_SUBSTEP_MAX_M,
  type SurfaceKind,
  type VehiclePhysics,
} from "@dnw/game-config";
import { resolveCircle } from "../collision/collision";
import type { SimWorld } from "../world";

export interface VehicleSimState {
  x: number;
  z: number;
  /** rotY = 0 hướng +Z. */
  rotY: number;
  /** m/s, âm khi lùi. */
  speed: number;
  /** -1..1, giá trị đã làm mượt của góc lái (dương = rẽ phải). */
  steer: number;
}

export interface DriveInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
}

export interface VehicleEnv extends SimWorld {
  surfaceAt?: (x: number, z: number) => SurfaceKind;
}

export interface VehicleStepResult {
  state: VehicleSimState;
  collided: boolean;
  surface: SurfaceKind;
}

const finite = (v: number) => (Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function substepCount(distance: number, maxStep: number = VEHICLE_SUBSTEP_MAX_M): number {
  return Math.max(1, Math.ceil(distance / maxStep));
}

/** Các hình tròn xấp xỉ thân xe dọc theo chiều dài (mục 8.13). */
export function bodyCircleOffsets(
  length: number,
  width: number,
): { radius: number; offsets: number[] } {
  const radius = width / 2;
  const count = length >= 3 ? 3 : 2;
  const span = Math.max(0, length - 2 * radius);
  const offsets = Array.from({ length: count }, (_, k) => -span / 2 + (span * k) / (count - 1));
  return { radius, offsets };
}

/**
 * Mô hình động học kiểu "xe đạp": tốc độ từ ga/phanh, góc lái giảm theo tốc độ,
 * yawRate = speed / wheelbase * tan(steerAngle). Rẽ phải làm rotY giảm.
 */
export function stepVehicle(
  state: VehicleSimState,
  input: DriveInput,
  dt: number,
  physics: VehiclePhysics,
  env: VehicleEnv = {},
): VehicleStepResult {
  const { handling, dimensions, surfaceSpeedFactor } = physics;
  const throttle = clamp(finite(input.throttle), -1, 1);
  const steerTarget = clamp(finite(input.steer), -1, 1);

  const surface = env.surfaceAt ? env.surfaceAt(state.x, state.z) : "road";
  const factor = surfaceSpeedFactor[surface];
  const maxForward = handling.maxSpeed * factor;
  const maxReverse = handling.maxReverseSpeed * factor;

  let speed = state.speed;
  let accel = 0;
  if (throttle > 0) accel = throttle * (speed >= 0 ? handling.acceleration : handling.brakeDecel);
  else if (throttle < 0)
    accel = throttle * (speed > 0 ? handling.brakeDecel : handling.acceleration);
  speed += accel * dt;
  speed -= handling.drag * speed * dt;

  if (input.handbrake) {
    const decel = handling.brakeDecel * VEHICLE_HANDBRAKE_FACTOR * dt;
    speed = Math.abs(speed) <= decel ? 0 : speed - Math.sign(speed) * decel;
  }
  if (throttle === 0 && Math.abs(speed) < 0.05) speed = 0;

  if (speed > maxForward) speed = Math.max(maxForward, speed - handling.brakeDecel * dt);
  else if (speed < -maxReverse) speed = Math.min(-maxReverse, speed + handling.brakeDecel * dt);

  const blend = Math.min(1, VEHICLE_STEER_RESPONSE * dt);
  const steer = state.steer + (steerTarget - state.steer) * blend;

  const speedRatio = handling.maxSpeed > 0 ? Math.min(1, Math.abs(speed) / handling.maxSpeed) : 0;
  const steerLimit =
    ((handling.maxSteerDeg * Math.PI) / 180) *
    (1 + (handling.highSpeedSteerFactor - 1) * speedRatio);
  const steerAngle = steer * steerLimit;
  const yawRate = (speed / handling.wheelbase) * Math.tan(steerAngle);

  const steps = substepCount(Math.abs(speed) * dt);
  const subDt = dt / steps;
  const { radius, offsets } = bodyCircleOffsets(dimensions.length, dimensions.width);

  let { x, z, rotY } = state;
  let collided = false;
  let impact = 0;

  for (let i = 0; i < steps; i++) {
    const nextRot = rotY - yawRate * subDt;
    const mid = (rotY + nextRot) / 2;
    let nx = x + Math.sin(mid) * speed * subDt;
    let nz = z + Math.cos(mid) * speed * subDt;

    if (env.collision) {
      const fx = Math.sin(nextRot);
      const fz = Math.cos(nextRot);
      for (const off of offsets) {
        const r = resolveCircle(env.collision, nx + fx * off, nz + fz * off, radius);
        if (r.hit) {
          nx += r.x - (nx + fx * off);
          nz += r.z - (nz + fz * off);
          collided = true;
          impact = Math.max(impact, Math.abs(fx * r.nx + fz * r.nz));
        }
      }
    }

    if (env.inBounds && !env.inBounds(nx, nz)) {
      collided = true;
      impact = 1;
      nx = x;
      nz = z;
    }
    x = nx;
    z = nz;
    rotY = nextRot;
  }

  if (collided) speed *= 1 - VEHICLE_COLLISION_SPEED_LOSS * impact;

  return { state: { x, z, rotY, speed, steer }, collided, surface };
}
