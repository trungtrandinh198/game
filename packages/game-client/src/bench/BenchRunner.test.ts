import { describe, expect, it } from "vitest";
import { createRuntime } from "../runtime";
import { BenchRunner, type BenchHooks, type BenchOptions } from "./BenchRunner";
import { MOBILE_THRESHOLDS, type BenchEnv } from "./report";
import { DRIVE_ROUTE, RouteFollower, WALK_ROUTE } from "./route";

describe("RouteFollower", () => {
  it("cần ít nhất hai điểm", () => {
    expect(() => new RouteFollower([{ x: 0, z: 0 }])).toThrow();
  });

  it("chuyển điểm đích khi tới gần và đếm vòng", () => {
    const r = new RouteFollower(
      [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
        { x: 100, z: 100 },
      ],
      5,
    );
    expect(r.advance({ x: 0, z: 0 })).toBe(false);
    expect(r.index).toBe(1);
    expect(r.advance({ x: 98, z: 0 })).toBe(false);
    expect(r.index).toBe(2);
    expect(r.advance({ x: 100, z: 99 })).toBe(true);
    expect(r.laps).toBe(1);
    expect(r.index).toBe(1);
    r.index = 2;
    r.reset();
    expect(r.index).toBe(1);
  });

  it("hướng ban đầu là hướng tới điểm thứ hai (rotY = 0 hướng +Z)", () => {
    expect(new RouteFollower(WALK_ROUTE).initialHeading).toBeCloseTo(Math.PI / 2);
    expect(
      new RouteFollower([
        { x: 0, z: 0 },
        { x: 0, z: 10 },
      ]).initialHeading,
    ).toBeCloseTo(0);
  });

  it("đi bộ quay camera dần về phía đích", () => {
    const r = new RouteFollower([
      { x: 0, z: 0 },
      { x: 0, z: 100 },
    ]);
    const c = r.walk({ x: 0, z: 0 }, Math.PI / 2, 0.1);
    expect(c.moveZ).toBe(1);
    expect(c.run).toBe(true);
    expect(c.yaw).toBeLessThan(Math.PI / 2);
    expect(c.yaw).toBeGreaterThan(0);
  });

  it("lái xe: đích bên trái thì đánh lái trái (âm), đích bên phải thì đánh lái phải", () => {
    const r = new RouteFollower([
      { x: 0, z: 0 },
      { x: 50, z: 0 },
    ]);
    // xe hướng +Z (rotY = 0), đích ở +X là bên trái của xe
    expect(r.drive({ x: 0, z: 0, rotY: 0 }).moveX).toBeLessThan(0);
    // xe hướng -Z (rotY = π), đích ở +X là bên phải của xe
    expect(r.drive({ x: 0, z: 0, rotY: Math.PI }).moveX).toBeGreaterThan(0);
    expect(r.drive({ x: 0, z: 0, rotY: Math.PI / 2 }).moveZ).toBe(1);
    expect(r.drive({ x: 0, z: 0, rotY: Math.PI }).moveZ).toBeLessThan(1);
  });
});

const env: BenchEnv = {
  userAgent: "test",
  devicePixelRatio: 1,
  screen: "100x100",
  hardwareConcurrency: 1,
  deviceMemoryGb: null,
  gpu: null,
  quality: "low",
  touch: false,
  timeToFirstFrameMs: null,
  transferredKb: null,
  heapSupported: true,
};

/** Mô phỏng vòng lặp của SandboxScene mà không cần render. */
function runBench(options: BenchOptions, frameMs = 1000 / 60) {
  const runtime = createRuntime();
  let now = 0;
  const hooks: BenchHooks = {
    now: () => now,
    readHeapMb: () => 60,
    getEnv: () => env,
    quality: "low",
  };
  const runner = new BenchRunner(runtime, hooks, options);
  runner.start();
  let furthestWalk = -Infinity;
  let maxSpeed = 0;
  let guard = 0;
  while (runner.phase !== "done" && guard++ < 100_000) {
    runtime.info.calls = 40;
    runtime.info.triangles = 9000;
    runner.onFrame(frameMs);
    const snap = runtime.input.snapshot();
    runtime.sim.step(frameMs / 1000, { ...snap, yaw: runtime.input.cameraYaw });
    if (runner.phase === "walk") furthestWalk = Math.max(furthestWalk, runtime.sim.player.x);
    maxSpeed = Math.max(maxSpeed, Math.abs(runtime.sim.mountedVehicle?.state.speed ?? 0));
    now += frameMs;
  }
  return { runner, runtime, furthestWalk, maxSpeed };
}

const options = (walk: number, drive: number): BenchOptions => ({
  walkSeconds: walk,
  driveSeconds: drive,
  heapEveryMs: 1000,
  thresholds: MOBILE_THRESHOLDS,
});

describe("BenchRunner", () => {
  it("chưa bắt đầu thì không làm gì", () => {
    const runtime = createRuntime();
    const runner = new BenchRunner(runtime, {
      now: () => 0,
      readHeapMb: () => null,
      getEnv: () => env,
      quality: "low",
    });
    runner.onFrame(16);
    expect(runner.phase).toBe("idle");
    expect(runner.remainingSeconds).toBe(0);
    expect(runner.report).toBeNull();
  });

  it("chạy hết hai phase và sinh báo cáo", () => {
    const { runner, runtime } = runBench(options(15, 15));
    expect(runner.phase).toBe("done");
    const r = runner.report!;
    expect(r.phases.map((p) => p.name)).toEqual(["walk", "drive"]);
    expect(r.overall.frames).toBeGreaterThan(1700);
    expect(r.render.callsAvg).toBe(40);
    expect(r.heap).not.toBeNull();
    expect(runtime.input.scripted).toBeNull();
  });

  it("đi bộ tiến dọc đường và không kẹt vào vật cản", () => {
    const { furthestWalk } = runBench(options(30, 1));
    expect(furthestWalk).toBeGreaterThan(-230 + 150);
  });

  it("lái ô tô lên tốc độ cao, qua cầu, hết vòng và không đâm", () => {
    const { runner, runtime, maxSpeed } = runBench(options(1, 60));
    expect(maxSpeed).toBeGreaterThan(12);
    expect(runner.laps).toBeGreaterThanOrEqual(1);
    expect(runtime.sim.collisions).toBe(0);
  });

  it("đi bộ hết một vòng qua cầu thì quay lại điểm đầu", () => {
    const { runner } = runBench(options(100, 1));
    expect(runner.laps).toBeGreaterThanOrEqual(1);
  });

  it("stop() trả quyền điều khiển về cho người dùng", () => {
    const runtime = createRuntime();
    const runner = new BenchRunner(
      runtime,
      { now: () => 0, readHeapMb: () => 60, getEnv: () => env, quality: "low" },
      options(5, 5),
    );
    runner.start();
    runner.onFrame(16);
    expect(runtime.input.scripted).not.toBeNull();
    runner.stop();
    expect(runtime.input.scripted).toBeNull();
    expect(runner.phase).toBe("idle");
  });

  it("elapsed và remaining hoạt động trong lúc chạy", () => {
    const runtime = createRuntime();
    let now = 0;
    const runner = new BenchRunner(
      runtime,
      { now: () => now, readHeapMb: () => 60, getEnv: () => env, quality: "low" },
      options(10, 10),
    );
    runner.start();
    now = 4000;
    expect(runner.elapsedSeconds).toBeCloseTo(4);
    expect(runner.remainingSeconds).toBeCloseTo(6);
  });
});

describe("lộ trình mặc định", () => {
  it("hai lộ trình nằm trong dải cầu |z| < 6 để qua được sông", () => {
    for (const p of [...WALK_ROUTE, ...DRIVE_ROUTE]) expect(Math.abs(p.z)).toBeLessThan(6);
  });
});
