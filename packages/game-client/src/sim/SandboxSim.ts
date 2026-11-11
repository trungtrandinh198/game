import {
  MOVEMENT_STATE,
  VEHICLE_DEFAULTS,
  VEHICLE_DISMOUNT_MAX_SPEED,
  VEHICLE_MOUNT_COOLDOWN_MS,
  type SurfaceKind,
  type VehicleKind,
  type VehiclePhysics,
} from "@dnw/game-config";
import {
  SANDBOX_VEHICLE_SPAWNS,
  buildSandboxWorld,
  checkMount,
  findDismountPosition,
  nearestMountable,
  stepPlayer,
  stepVehicle,
  type SandboxWorld,
  type VehicleSimState,
} from "@dnw/game-core";

export interface SandboxVehicle {
  id: string;
  kind: VehicleKind;
  physics: VehiclePhysics;
  state: VehicleSimState;
  hasDriver: boolean;
  /** Quãng đường lăn của bánh (m), dùng để quay bánh khi render. */
  roll: number;
}

export interface Controls {
  /** -1 trái .. 1 phải; khi lái xe là góc lái. */
  moveX: number;
  /** -1 lùi .. 1 tiến; khi lái xe là ga/phanh. */
  moveZ: number;
  run: boolean;
  yaw: number;
  handbrake: boolean;
}

export type NoticeCode =
  | "VEHICLE_MOUNTED"
  | "VEHICLE_DISMOUNTED"
  | "VEHICLE_TOO_FAST"
  | "VEHICLE_NO_DISMOUNT_SPACE"
  | "VEHICLE_NONE_NEARBY";

export interface Notice {
  code: NoticeCode;
  at: number;
}

export const IDLE_CONTROLS: Controls = { moveX: 0, moveZ: 0, run: false, yaw: 0, handbrake: false };

const SPAWNS = SANDBOX_VEHICLE_SPAWNS;

/** Mô phỏng cục bộ của sandbox: người chơi, xe, lên/xuống xe. Không phụ thuộc DOM hay React. */
export class SandboxSim {
  readonly world: SandboxWorld;
  readonly vehicles: SandboxVehicle[];
  player = { x: -20, z: 9, rotY: Math.PI / 2, movementState: 0 };
  mountedId: string | null = null;
  time = 0;
  notice: Notice | null = null;
  surface: SurfaceKind = "road";
  collisions = 0;
  private lastMountAt = -Infinity;

  constructor(world: SandboxWorld = buildSandboxWorld()) {
    this.world = world;
    this.vehicles = SPAWNS.map((s) => ({
      id: s.id,
      kind: s.kind,
      physics: VEHICLE_DEFAULTS[s.kind],
      state: { x: s.x, z: s.z, rotY: s.rotY, speed: 0, steer: 0 },
      hasDriver: false,
      roll: 0,
    }));
  }

  get mountedVehicle(): SandboxVehicle | undefined {
    return this.vehicles.find((v) => v.id === this.mountedId);
  }

  /** Xe trống gần nhất trong tầm lên xe (cho nút "Lên xe"). */
  get mountCandidate(): SandboxVehicle | undefined {
    if (this.mountedId) return undefined;
    const items = this.vehicles.map((v) => ({
      v,
      id: v.id,
      x: v.state.x,
      z: v.state.z,
      hasDriver: v.hasDriver,
    }));
    return nearestMountable(this.player, items)?.v;
  }

  /** Vị trí và tốc độ để camera bám theo. */
  get focus(): { x: number; z: number; rotY: number; speed: number } {
    const v = this.mountedVehicle;
    if (v) return { x: v.state.x, z: v.state.z, rotY: v.state.rotY, speed: v.state.speed };
    return { x: this.player.x, z: this.player.z, rotY: this.player.rotY, speed: 0 };
  }

  interact(): void {
    if ((this.time - this.lastMountAt) * 1000 < VEHICLE_MOUNT_COOLDOWN_MS) return;
    if (this.mountedId) this.dismount();
    else this.mount();
  }

  private say(code: NoticeCode): void {
    this.notice = { code, at: this.time };
  }

  private mount(): void {
    const vehicle = this.mountCandidate;
    if (!vehicle) {
      this.say("VEHICLE_NONE_NEARBY");
      return;
    }
    const result = checkMount(this.player, {
      id: vehicle.id,
      x: vehicle.state.x,
      z: vehicle.state.z,
      hasDriver: vehicle.hasDriver,
    });
    if (!result.ok) return;
    vehicle.hasDriver = true;
    this.mountedId = vehicle.id;
    this.lastMountAt = this.time;
    this.player.movementState = MOVEMENT_STATE.RIDING;
    this.say("VEHICLE_MOUNTED");
  }

  private dismount(): void {
    const vehicle = this.mountedVehicle;
    if (!vehicle) return;
    if (Math.abs(vehicle.state.speed) > VEHICLE_DISMOUNT_MAX_SPEED) {
      this.say("VEHICLE_TOO_FAST");
      return;
    }
    const spot = findDismountPosition(vehicle.state, vehicle.physics.dimensions, this.world);
    if (!spot) {
      this.say("VEHICLE_NO_DISMOUNT_SPACE");
      return;
    }
    vehicle.hasDriver = false;
    this.mountedId = null;
    this.lastMountAt = this.time;
    this.player = {
      x: spot.x,
      z: spot.z,
      rotY: vehicle.state.rotY,
      movementState: MOVEMENT_STATE.IDLE,
    };
    this.say("VEHICLE_DISMOUNTED");
  }

  step(dt: number, controls: Controls): void {
    this.time += dt;
    const env = {
      collision: this.world.collision,
      inBounds: this.world.inBounds,
      surfaceAt: this.world.surfaceAt,
    };

    for (const vehicle of this.vehicles) {
      const driven = vehicle.id === this.mountedId;
      if (!driven && vehicle.state.speed === 0) continue;
      const input = driven
        ? { throttle: controls.moveZ, steer: controls.moveX, handbrake: controls.handbrake }
        : { throttle: 0, steer: 0, handbrake: true };
      const result = stepVehicle(vehicle.state, input, dt, vehicle.physics, env);
      vehicle.state = result.state;
      vehicle.roll += result.state.speed * dt;
      if (driven) {
        this.surface = result.surface;
        if (result.collided) this.collisions++;
      }
    }

    const ridden = this.mountedVehicle;
    if (ridden) {
      this.player = {
        x: ridden.state.x,
        z: ridden.state.z,
        rotY: ridden.state.rotY,
        movementState: MOVEMENT_STATE.RIDING,
      };
      return;
    }

    const r = stepPlayer(this.player, controls, dt, this.world);
    this.player = { x: r.x, z: r.z, rotY: r.rotY, movementState: r.movementState };
    this.surface = this.world.surfaceAt(r.x, r.z);
  }
}
