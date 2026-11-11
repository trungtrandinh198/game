import { describe, expect, it } from "vitest";
import {
  TICK_DT,
  VEHICLE_DEFAULTS,
  VEHICLE_SUBSTEP_MAX_M,
  type VehicleKind,
} from "@dnw/game-config";
import { createCollisionWorld } from "../collision/collision";
import {
  bodyCircleOffsets,
  stepVehicle,
  substepCount,
  type DriveInput,
  type VehicleSimState,
} from "./stepVehicle";

const rest: VehicleSimState = { x: 0, z: 0, rotY: 0, speed: 0, steer: 0 };
const drive = (over: Partial<DriveInput> = {}): DriveInput => ({
  throttle: 0,
  steer: 0,
  handbrake: false,
  ...over,
});

function run(
  kind: VehicleKind,
  state: VehicleSimState,
  input: DriveInput,
  steps: number,
  env: Parameters<typeof stepVehicle>[4] = {},
): VehicleSimState {
  let s = state;
  for (let i = 0; i < steps; i++)
    s = stepVehicle(s, input, TICK_DT, VEHICLE_DEFAULTS[kind], env).state;
  return s;
}

/** PRNG xác định để test lặp lại được. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.each(["bicycle", "motorbike", "car"] as const)("stepVehicle (%s)", (kind) => {
  const physics = VEHICLE_DEFAULTS[kind];
  const { maxSpeed, maxReverseSpeed } = physics.handling;

  it("tăng tốc dần và không vượt maxSpeed", () => {
    let s = rest;
    let previous = 0;
    for (let i = 0; i < 600; i++) {
      s = stepVehicle(s, drive({ throttle: 1 }), TICK_DT, physics).state;
      expect(s.speed).toBeLessThanOrEqual(maxSpeed + 1e-9);
      expect(s.speed).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = s.speed;
    }
    expect(s.speed).toBeGreaterThan(maxSpeed * 0.9);
  });

  it("lùi bị giới hạn maxReverseSpeed", () => {
    const s = run(kind, rest, drive({ throttle: -1 }), 400);
    expect(s.speed).toBeGreaterThanOrEqual(-maxReverseSpeed - 1e-9);
    expect(s.speed).toBeLessThan(0);
  });

  it("phanh đưa xe về 0 và không chuyển sang lùi", () => {
    let s: VehicleSimState = { ...rest, speed: maxSpeed };
    let lastSpeed = s.speed;
    for (let i = 0; i < 200; i++) {
      s = stepVehicle(s, drive({ throttle: -1 }), TICK_DT, physics).state;
      if (lastSpeed > 0.5) expect(s.speed).toBeLessThanOrEqual(lastSpeed);
      lastSpeed = s.speed;
    }
    expect(s.speed).toBeLessThan(0);
  });

  it("phanh tay dừng nhanh hơn xả ga", () => {
    const start: VehicleSimState = { ...rest, speed: maxSpeed };
    const coast = run(kind, start, drive(), 20);
    const hand = run(kind, start, drive({ handbrake: true }), 20);
    expect(hand.speed).toBeLessThan(coast.speed);
  });

  it("xả ga thì giảm dần rồi dừng hẳn", () => {
    const s = run(kind, { ...rest, speed: maxSpeed }, drive(), 3000);
    expect(s.speed).toBe(0);
  });

  it("rẽ phải làm xe lệch về -X và giảm rotY", () => {
    const s = run(kind, { ...rest, speed: maxSpeed * 0.5 }, drive({ throttle: 0.5, steer: 1 }), 30);
    expect(s.x).toBeLessThan(0);
    expect(s.rotY).toBeLessThan(0);
  });

  it("rẽ trái làm xe lệch về +X", () => {
    const s = run(
      kind,
      { ...rest, speed: maxSpeed * 0.5 },
      drive({ throttle: 0.5, steer: -1 }),
      30,
    );
    expect(s.x).toBeGreaterThan(0);
    expect(s.rotY).toBeGreaterThan(0);
  });

  it("đứng yên thì không quay dù đánh lái", () => {
    const s = run(kind, rest, drive({ steer: 1 }), 20);
    expect(s.rotY).toBeCloseTo(0);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(0);
  });

  it("không bị NaN khi input vô lý", () => {
    const s = run(kind, rest, drive({ throttle: NaN, steer: Infinity }), 5);
    expect(Number.isFinite(s.x) && Number.isFinite(s.speed) && Number.isFinite(s.rotY)).toBe(true);
  });

  it("input lớn bị kẹp về [-1, 1]", () => {
    const a = run(kind, rest, drive({ throttle: 100 }), 10);
    const b = run(kind, rest, drive({ throttle: 1 }), 10);
    expect(a.speed).toBeCloseTo(b.speed);
  });
});

describe("stepVehicle: bề mặt", () => {
  it("ô tô trên đất trống bị kẹp theo hệ số bề mặt", () => {
    const physics = VEHICLE_DEFAULTS.car;
    const s = run("car", rest, drive({ throttle: 1 }), 600, { surfaceAt: () => "ground" });
    expect(s.speed).toBeLessThanOrEqual(
      physics.handling.maxSpeed * physics.surfaceSpeedFactor.ground + 1e-6,
    );
  });

  it("giảm tốc dần khi từ đường ra đất trống", () => {
    const physics = VEHICLE_DEFAULTS.car;
    const cap = physics.handling.maxSpeed * physics.surfaceSpeedFactor.ground;
    const first = stepVehicle({ ...rest, speed: 18 }, drive({ throttle: 1 }), TICK_DT, physics, {
      surfaceAt: () => "ground",
    });
    expect(first.state.speed).toBeLessThan(18);
    expect(first.state.speed).toBeGreaterThan(cap);
    expect(first.surface).toBe("ground");
  });

  it("lùi cũng bị kẹp theo hệ số bề mặt", () => {
    const physics = VEHICLE_DEFAULTS.car;
    const cap = physics.handling.maxReverseSpeed * physics.surfaceSpeedFactor.ground;
    const s = run("car", { ...rest, speed: -4 }, drive({ throttle: -1 }), 100, {
      surfaceAt: () => "ground",
    });
    expect(s.speed).toBeGreaterThanOrEqual(-cap - 1e-6);
  });
});

describe("stepVehicle: va chạm", () => {
  it("không xuyên tường mỏng ở tốc độ tối đa (100 lần thử ngẫu nhiên)", () => {
    const wall = createCollisionWorld([[20, -60, 20, 60]], 8);
    const rand = mulberry32(42);
    for (const kind of ["bicycle", "motorbike", "car"] as const) {
      for (let trial = 0; trial < 100; trial++) {
        let s: VehicleSimState = {
          x: -30 + rand() * 25,
          z: (rand() - 0.5) * 40,
          rotY: Math.PI / 2 + (rand() - 0.5),
          speed: 0,
          steer: 0,
        };
        for (let i = 0; i < 300; i++) {
          s = stepVehicle(s, drive({ throttle: 1 }), TICK_DT, VEHICLE_DEFAULTS[kind], {
            collision: wall,
          }).state;
          expect(s.x).toBeLessThan(20);
        }
      }
    }
  });

  it("đâm thẳng làm mất tốc độ, báo collided", () => {
    const wall = createCollisionWorld([[10, -60, 10, 60]], 8);
    let s: VehicleSimState = { x: 0, z: 0, rotY: Math.PI / 2, speed: 14, steer: 0 };
    let collided = false;
    for (let i = 0; i < 40; i++) {
      const r = stepVehicle(s, drive({ throttle: 1 }), TICK_DT, VEHICLE_DEFAULTS.motorbike, {
        collision: wall,
      });
      collided ||= r.collided;
      s = r.state;
    }
    expect(collided).toBe(true);
    expect(s.speed).toBeLessThan(2);
  });

  it("cọ sát tường ở góc nhỏ mất ít tốc độ hơn đâm thẳng", () => {
    const wall = createCollisionWorld([[10, -200, 10, 200]], 8);
    const head = stepVehicle(
      { x: 9, z: 0, rotY: Math.PI / 2, speed: 14, steer: 0 },
      drive(),
      TICK_DT,
      VEHICLE_DEFAULTS.motorbike,
      { collision: wall },
    );
    const graze = stepVehicle(
      { x: 9, z: 0, rotY: 0.1, speed: 14, steer: 0 },
      drive(),
      TICK_DT,
      VEHICLE_DEFAULTS.motorbike,
      { collision: wall },
    );
    expect(head.collided).toBe(true);
    expect(graze.state.speed).toBeGreaterThan(head.state.speed);
  });

  it("không ra khỏi biên", () => {
    const inBounds = (x: number) => x <= 30;
    let s: VehicleSimState = { ...rest, rotY: Math.PI / 2 };
    let collided = false;
    for (let i = 0; i < 400; i++) {
      const r = stepVehicle(s, drive({ throttle: 1 }), TICK_DT, VEHICLE_DEFAULTS.car, { inBounds });
      collided ||= r.collided;
      s = r.state;
      expect(s.x).toBeLessThanOrEqual(30);
    }
    expect(collided).toBe(true);
  });
});

describe("helper", () => {
  it("substepCount giữ mỗi bước dưới ngưỡng", () => {
    for (const d of [0, 0.1, 0.25, 0.26, 0.9, 5]) {
      const n = substepCount(d);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(d / n).toBeLessThanOrEqual(VEHICLE_SUBSTEP_MAX_M + 1e-12);
    }
  });

  it("ô tô có 3 hình tròn, xe hai bánh có 2 và nằm trong thân xe", () => {
    const car = bodyCircleOffsets(4.2, 1.8);
    const bike = bodyCircleOffsets(1.9, 0.7);
    expect(car.offsets).toHaveLength(3);
    expect(bike.offsets).toHaveLength(2);
    for (const o of car.offsets) expect(Math.abs(o) + car.radius).toBeLessThanOrEqual(2.1 + 1e-9);
  });
});
