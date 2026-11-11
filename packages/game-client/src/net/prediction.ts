import {
  RECONCILE_SMOOTH_M,
  RECONCILE_SNAP_M,
  TICK_DT,
  type VehiclePhysics,
} from "@dnw/game-config";
import {
  stepPlayer,
  stepVehicle,
  type DriveInput,
  type PlayerInput,
  type PlayerSimState,
  type SimWorld,
  type VehicleEnv,
  type VehicleSimState,
} from "@dnw/game-core";

export type ReconcileAction = "none" | "smooth" | "snap";

export interface ReconcileResult {
  error: number;
  action: ReconcileAction;
}

const MAX_PENDING = 60;
const SMOOTH_BLEND = 0.3;

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Dự đoán phía client cho nhân vật của mình (mục 8.9): chạy cùng `stepPlayer` với server,
 * mỗi input tương ứng đúng một tick, rồi đối chiếu theo `lastInputSeq` mà server trả về.
 */
export class PlayerPredictor {
  state: PlayerSimState;
  prev: PlayerSimState;
  readonly pending: { seq: number; input: PlayerInput }[] = [];

  constructor(
    initial: PlayerSimState,
    private readonly world: SimWorld,
  ) {
    this.state = { ...initial };
    this.prev = { ...initial };
  }

  reset(state: PlayerSimState): void {
    this.state = { ...state };
    this.prev = { ...state };
    this.pending.length = 0;
  }

  apply(seq: number, input: PlayerInput): void {
    this.prev = this.state;
    const r = stepPlayer(this.state, input, TICK_DT, this.world);
    this.state = { x: r.x, z: r.z, rotY: r.rotY };
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  reconcile(server: PlayerSimState, ackSeq: number): ReconcileResult {
    while (this.pending.length > 0 && this.pending[0]!.seq <= ackSeq) this.pending.shift();
    let replay: PlayerSimState = { ...server };
    for (const p of this.pending) {
      const r = stepPlayer(replay, p.input, TICK_DT, this.world);
      replay = { x: r.x, z: r.z, rotY: r.rotY };
    }
    const error = dist(replay, this.state);
    if (error > RECONCILE_SNAP_M) {
      this.state = replay;
      this.prev = replay;
      return { error, action: "snap" };
    }
    if (error > RECONCILE_SMOOTH_M) {
      const blend = (from: PlayerSimState): PlayerSimState => ({
        x: from.x + (replay.x - from.x) * SMOOTH_BLEND,
        z: from.z + (replay.z - from.z) * SMOOTH_BLEND,
        rotY: from.rotY,
      });
      this.state = blend(this.state);
      this.prev = blend(this.prev);
      return { error, action: "smooth" };
    }
    return { error, action: "none" };
  }

  /** Vị trí hiển thị, nội suy giữa hai tick dự đoán (alpha 0..1). */
  render(alpha: number): PlayerSimState {
    const a = Math.max(0, Math.min(1, alpha));
    return {
      x: this.prev.x + (this.state.x - this.prev.x) * a,
      z: this.prev.z + (this.state.z - this.prev.z) * a,
      rotY: this.state.rotY,
    };
  }
}

/** Dự đoán cho xe mà người chơi đang lái. */
export class VehiclePredictor {
  state: VehicleSimState;
  prev: VehicleSimState;
  readonly pending: { seq: number; input: DriveInput }[] = [];

  constructor(
    initial: VehicleSimState,
    private readonly physics: VehiclePhysics,
    private readonly env: VehicleEnv,
  ) {
    this.state = { ...initial };
    this.prev = { ...initial };
  }

  reset(state: VehicleSimState): void {
    this.state = { ...state };
    this.prev = { ...state };
    this.pending.length = 0;
  }

  apply(seq: number, input: DriveInput): void {
    this.prev = this.state;
    this.state = stepVehicle(this.state, input, TICK_DT, this.physics, this.env).state;
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  reconcile(server: VehicleSimState, ackSeq: number): ReconcileResult {
    while (this.pending.length > 0 && this.pending[0]!.seq <= ackSeq) this.pending.shift();
    let replay: VehicleSimState = { ...server };
    for (const p of this.pending) {
      replay = stepVehicle(replay, p.input, TICK_DT, this.physics, this.env).state;
    }
    const error = dist(replay, this.state);
    if (error > RECONCILE_SNAP_M) {
      this.state = replay;
      this.prev = replay;
      return { error, action: "snap" };
    }
    if (error > RECONCILE_SMOOTH_M) {
      const blend = (from: VehicleSimState): VehicleSimState => ({
        ...from,
        x: from.x + (replay.x - from.x) * SMOOTH_BLEND,
        z: from.z + (replay.z - from.z) * SMOOTH_BLEND,
        speed: from.speed + (replay.speed - from.speed) * SMOOTH_BLEND,
      });
      this.state = blend(this.state);
      this.prev = blend(this.prev);
      return { error, action: "smooth" };
    }
    return { error, action: "none" };
  }

  render(alpha: number): VehicleSimState {
    const a = Math.max(0, Math.min(1, alpha));
    return {
      ...this.state,
      x: this.prev.x + (this.state.x - this.prev.x) * a,
      z: this.prev.z + (this.state.z - this.prev.z) * a,
    };
  }
}
