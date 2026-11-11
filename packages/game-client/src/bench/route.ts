import { lerpAngle } from "../net/snapshot";

export interface Waypoint {
  x: number;
  z: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Đi dọc các điểm mốc; khi tới điểm cuối thì báo "hết vòng" để runner đưa nhân vật/xe về điểm đầu. */
export class RouteFollower {
  index = 1;
  laps = 0;

  constructor(
    private readonly points: readonly Waypoint[],
    private readonly arriveM = 6,
  ) {
    if (points.length < 2) throw new Error("Lộ trình cần ít nhất 2 điểm");
  }

  get start(): Waypoint {
    return this.points[0]!;
  }

  /** Hướng (rotY) từ điểm đầu tới điểm thứ hai, để đặt hướng ban đầu. */
  get initialHeading(): number {
    const a = this.points[0]!;
    const b = this.points[1]!;
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  reset(): void {
    this.index = 1;
  }

  /** Cập nhật điểm đích hiện tại; trả true nếu vừa hoàn thành một vòng. */
  advance(pos: Waypoint): boolean {
    const target = this.points[this.index]!;
    if (Math.hypot(target.x - pos.x, target.z - pos.z) > this.arriveM) return false;
    this.index++;
    if (this.index >= this.points.length) {
      this.laps++;
      this.index = 1;
      return true;
    }
    return false;
  }

  private heading(pos: Waypoint): number {
    const t = this.points[this.index]!;
    return Math.atan2(t.x - pos.x, t.z - pos.z);
  }

  /** Điều khiển đi bộ: nhìn về đích và chạy tiến. `cameraYaw` mới được làm mượt về phía đích. */
  walk(pos: Waypoint, cameraYaw: number, dt: number) {
    const desired = this.heading(pos);
    const yaw = lerpAngle(cameraYaw, desired, 1 - Math.exp(-6 * dt));
    return { moveX: 0, moveZ: 1, run: true, handbrake: false, yaw };
  }

  /** Điều khiển lái xe: đánh lái theo sai lệch hướng, giảm ga khi cần bẻ gấp. */
  drive(state: Waypoint & { rotY: number }) {
    const error = wrap(this.heading(state) - state.rotY);
    const steer = clamp(-error * 1.5, -1, 1);
    const throttle = Math.abs(error) > 0.9 ? 0.4 : 1;
    return { moveX: steer, moveZ: throttle, run: false, handbrake: false };
  }
}

/** Lộ trình mặc định trên sandbox: dọc đường ngang, băng qua cầu sông (|z| < 6 mới qua được cầu). */
export const WALK_ROUTE: readonly Waypoint[] = [
  { x: -230, z: 2 },
  { x: 230, z: 2 },
];

export const DRIVE_ROUTE: readonly Waypoint[] = [
  { x: -230, z: -3 },
  { x: 230, z: -3 },
];
