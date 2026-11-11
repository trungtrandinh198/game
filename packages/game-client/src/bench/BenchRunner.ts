import type { SandboxRuntime } from "../runtime";
import {
  MOBILE_THRESHOLDS,
  buildReport,
  type BenchEnv,
  type BenchReport,
  type BenchSamples,
  type Thresholds,
} from "./report";
import { DRIVE_ROUTE, RouteFollower, WALK_ROUTE } from "./route";

export type BenchPhase = "idle" | "walk" | "drive" | "done";

export interface BenchOptions {
  walkSeconds: number;
  driveSeconds: number;
  /** Chu kỳ lấy mẫu bộ nhớ JS (ms). */
  heapEveryMs: number;
  thresholds: Thresholds;
}

export const DEFAULT_BENCH: BenchOptions = {
  walkSeconds: 60,
  driveSeconds: 60,
  heapEveryMs: 2000,
  thresholds: MOBILE_THRESHOLDS,
};

export interface BenchHooks {
  now: () => number;
  /** Bộ nhớ JS đang dùng (MB) hoặc null nếu trình duyệt không hỗ trợ. */
  readHeapMb: () => number | null;
  getEnv: (info: { quality: string }) => BenchEnv;
  quality: string;
}

/**
 * Chạy lộ trình tự động trên sandbox: đi bộ rồi lái ô tô, ghi thời gian khung hình, draw call và bộ nhớ.
 * Gọi `onFrame` một lần mỗi khung hình, trước khi mô phỏng chạy.
 */
export class BenchRunner {
  phase: BenchPhase = "idle";
  report: BenchReport | null = null;
  laps = 0;

  private samples: BenchSamples = BenchRunner.emptySamples();
  private startedAtMs = 0;
  private phaseStartMs = 0;
  private lastHeapAt = 0;
  private startedAtIso = "";
  private walk = new RouteFollower(WALK_ROUTE);
  private drive = new RouteFollower(DRIVE_ROUTE);
  private mountedFor = 0;

  constructor(
    private readonly runtime: SandboxRuntime,
    private readonly hooks: BenchHooks,
    private readonly options: BenchOptions = DEFAULT_BENCH,
  ) {}

  private static emptySamples(): BenchSamples {
    return {
      frames: [],
      calls: [],
      triangles: [],
      heap: [],
      phases: [],
      geometriesEnd: 0,
      texturesEnd: 0,
    };
  }

  /** Số giây còn lại của phase hiện tại. */
  get remainingSeconds(): number {
    if (this.phase === "idle" || this.phase === "done") return 0;
    const total = this.phase === "walk" ? this.options.walkSeconds : this.options.driveSeconds;
    return Math.max(0, total - (this.hooks.now() - this.phaseStartMs) / 1000);
  }

  get elapsedSeconds(): number {
    return this.phase === "idle" ? 0 : (this.hooks.now() - this.startedAtMs) / 1000;
  }

  start(): void {
    const now = this.hooks.now();
    this.samples = BenchRunner.emptySamples();
    this.report = null;
    this.laps = 0;
    this.startedAtMs = now;
    this.startedAtIso = new Date().toISOString();
    this.lastHeapAt = now;
    this.walk = new RouteFollower(WALK_ROUTE);
    this.drive = new RouteFollower(DRIVE_ROUTE);
    this.runtime.stats.reset();
    this.enter("walk");
    this.sampleHeap(now);
  }

  stop(): void {
    this.runtime.input.scripted = null;
    this.phase = "idle";
  }

  private enter(phase: BenchPhase): void {
    const now = this.hooks.now();
    const last = this.samples.phases[this.samples.phases.length - 1];
    if (last && last.endMs === 0) last.endMs = now - this.startedAtMs;
    this.phase = phase;
    this.phaseStartMs = now;
    if (phase === "walk" || phase === "drive") {
      this.samples.phases.push({ name: phase, startMs: now - this.startedAtMs, endMs: 0 });
    }
    const { sim, input } = this.runtime;

    if (phase === "walk") {
      const s = this.walk.start;
      sim.player = { x: s.x, z: s.z, rotY: this.walk.initialHeading, movementState: 0 };
      input.cameraYaw = this.walk.initialHeading;
      this.walk.reset();
    }

    if (phase === "drive") {
      if (sim.mountedId) sim.interact();
      const car = sim.vehicles.find((v) => v.id === "car-1")!;
      const s = this.drive.start;
      car.state = { x: s.x, z: s.z, rotY: this.drive.initialHeading, speed: 0, steer: 0 };
      sim.player = { x: s.x + 1.2, z: s.z, rotY: this.drive.initialHeading, movementState: 0 };
      this.drive.reset();
      sim.interact();
      this.mountedFor = 0;
      input.cameraYaw = this.drive.initialHeading;
    }
  }

  private sampleHeap(now: number): void {
    const mb = this.hooks.readHeapMb();
    if (mb !== null) this.samples.heap.push({ t: now - this.startedAtMs, mb });
    this.lastHeapAt = now;
  }

  private finish(): void {
    const now = this.hooks.now();
    const last = this.samples.phases[this.samples.phases.length - 1];
    if (last && last.endMs === 0) last.endMs = now - this.startedAtMs;
    this.sampleHeap(now);
    this.samples.geometriesEnd = this.runtime.info.geometries;
    this.samples.texturesEnd = this.runtime.info.textures;
    this.runtime.input.scripted = null;
    this.phase = "done";
    this.report = buildReport(
      this.samples,
      this.hooks.getEnv({ quality: this.hooks.quality }),
      this.options.thresholds,
      this.startedAtIso,
    );
  }

  /** `deltaMs` là thời gian của khung hình vừa rồi. */
  onFrame(deltaMs: number): void {
    if (this.phase === "idle" || this.phase === "done") return;
    const now = this.hooks.now();
    const dt = Math.min(deltaMs / 1000, 0.1);
    const { sim, input, info } = this.runtime;

    this.samples.frames.push({ ms: deltaMs, phase: this.phase });
    this.samples.calls.push(info.calls);
    this.samples.triangles.push(info.triangles);
    if (now - this.lastHeapAt >= this.options.heapEveryMs) this.sampleHeap(now);

    if (this.phase === "walk") {
      if (this.walk.advance(sim.player)) {
        this.laps++;
        const s = this.walk.start;
        sim.player = { x: s.x, z: s.z, rotY: this.walk.initialHeading, movementState: 0 };
      }
      const c = this.walk.walk(sim.player, input.cameraYaw, dt);
      input.cameraYaw = c.yaw;
      input.scripted = { moveX: c.moveX, moveZ: c.moveZ, run: c.run, handbrake: c.handbrake };
      if (this.remainingSeconds <= 0) this.enter("drive");
      return;
    }

    // drive: đợi vài khung để lên xe xong rồi mới đánh lái
    const car = sim.mountedVehicle;
    this.mountedFor += dt;
    if (!car) {
      if (this.mountedFor > 0.7) sim.interact();
      input.scripted = { moveX: 0, moveZ: 0, run: false, handbrake: false };
      return;
    }
    if (this.drive.advance(car.state)) {
      this.laps++;
      const s = this.drive.start;
      car.state = {
        x: s.x,
        z: s.z,
        rotY: this.drive.initialHeading,
        speed: car.state.speed,
        steer: 0,
      };
    }
    input.scripted = { ...this.drive.drive(car.state), run: false, handbrake: false };
    if (this.remainingSeconds <= 0) this.finish();
  }
}
