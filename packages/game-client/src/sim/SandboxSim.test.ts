import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, VEHICLE_DEFAULTS } from "@dnw/game-config";
import { IDLE_CONTROLS, SandboxSim, type Controls } from "./SandboxSim";
import { buildSandboxWorld, classifySurface, WATER, WORLD_HALF_SIZE } from "@dnw/game-core";

const DT = 1 / 60;
const controls = (over: Partial<Controls> = {}): Controls => ({ ...IDLE_CONTROLS, ...over });

function advance(sim: SandboxSim, seconds: number, c: Controls) {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT, c);
}

/** Đưa người chơi sát xe rồi lên xe, bỏ qua cooldown ban đầu. */
function mountVehicle(sim: SandboxSim, id: string) {
  const v = sim.vehicles.find((x) => x.id === id)!;
  sim.player = { x: v.state.x + 1, z: v.state.z, rotY: 0, movementState: 0 };
  advance(sim, 1, IDLE_CONTROLS);
  sim.interact();
  return v;
}

describe("sandboxWorld", () => {
  const world = buildSandboxWorld();

  it("có vài trăm nhà, cảnh xác định theo seed", () => {
    expect(world.buildings.length).toBeGreaterThan(200);
    expect(buildSandboxWorld().buildings.length).toBe(world.buildings.length);
    expect(buildSandboxWorld(7).buildings.length).not.toBe(-1);
  });

  it("không có nhà chồng lên đường hoặc sông", () => {
    for (const b of world.buildings) {
      expect(Math.abs(b.x) - b.w / 2).toBeGreaterThanOrEqual(10);
      expect(Math.abs(b.z) - b.d / 2).toBeGreaterThanOrEqual(10);
      expect(b.x + b.w / 2 > WATER.minX && b.x - b.w / 2 < WATER.maxX).toBe(false);
    }
  });

  it("phân loại bề mặt và tra qua SurfaceMap khớp nhau", () => {
    for (const [x, z] of [
      [0, 100],
      [7, 100],
      [50, 50],
      [100, 0],
      [-200, -200],
    ] as const) {
      expect(world.surfaceAt(x, z)).toBe(classifySurface(x, z));
    }
    expect(classifySurface(0, 0)).toBe("road");
    expect(classifySurface(7, 50)).toBe("pedestrian");
    expect(classifySurface(50, 50)).toBe("ground");
  });
});

describe("SandboxSim: đi bộ", () => {
  it("không đi xuyên nhà", () => {
    const sim = new SandboxSim();
    const b = sim.world.buildings.find((x) => x.x > 20 && x.x < 70 && Math.abs(x.z) > 20)!;
    sim.player = { x: b.x - b.w / 2 - 3, z: b.z, rotY: 0, movementState: 0 };
    advance(sim, 5, controls({ moveZ: 1, yaw: Math.PI / 2, run: true }));
    expect(sim.player.x).toBeLessThanOrEqual(b.x - b.w / 2 - PLAYER_RADIUS + 1e-6);
  });

  it("không ra khỏi biên thế giới", () => {
    const sim = new SandboxSim();
    sim.player = { x: -240, z: 9, rotY: 0, movementState: 0 };
    advance(sim, 10, controls({ moveZ: 1, yaw: -Math.PI / 2, run: true }));
    expect(sim.player.x).toBeGreaterThanOrEqual(-WORLD_HALF_SIZE);
  });
});

describe("SandboxSim: lên/xuống xe", () => {
  it("báo không có xe khi ở xa", () => {
    const sim = new SandboxSim();
    sim.player = { x: -100, z: 100, rotY: 0, movementState: 0 };
    advance(sim, 1, IDLE_CONTROLS);
    sim.interact();
    expect(sim.mountedId).toBeNull();
    expect(sim.notice?.code).toBe("VEHICLE_NONE_NEARBY");
  });

  it("lên xe, nhân vật ở trạng thái riding và đi theo xe", () => {
    const sim = new SandboxSim();
    const v = mountVehicle(sim, "motorbike-1");
    expect(sim.mountedId).toBe("motorbike-1");
    expect(v.hasDriver).toBe(true);
    advance(sim, 2, controls({ moveZ: 1 }));
    expect(sim.player.movementState).toBe(3);
    expect(sim.player.x).toBeCloseTo(v.state.x);
    expect(sim.player.z).toBeCloseTo(v.state.z);
  });

  it("không lên được xe đã có người lái (mô phỏng người khác)", () => {
    const sim = new SandboxSim();
    const v = sim.vehicles.find((x) => x.id === "car-1")!;
    v.hasDriver = true;
    sim.player = { x: v.state.x + 1, z: v.state.z, rotY: 0, movementState: 0 };
    advance(sim, 1, IDLE_CONTROLS);
    sim.interact();
    expect(sim.mountedId).toBeNull();
  });

  it("chỉ xuống xe khi đủ chậm", () => {
    const sim = new SandboxSim();
    mountVehicle(sim, "car-1");
    advance(sim, 4, controls({ moveZ: 1 }));
    expect(Math.abs(sim.mountedVehicle!.state.speed)).toBeGreaterThan(3);
    advance(sim, 1, IDLE_CONTROLS);
    sim.interact();
    expect(sim.mountedId).toBe("car-1");
    expect(sim.notice?.code).toBe("VEHICLE_TOO_FAST");

    advance(sim, 6, controls({ handbrake: true }));
    sim.interact();
    expect(sim.mountedId).toBeNull();
    expect(sim.notice?.code).toBe("VEHICLE_DISMOUNTED");
  });

  it("xuống xe đặt người chơi cạnh xe, không chồng lên vật cản", () => {
    const sim = new SandboxSim();
    const v = mountVehicle(sim, "motorbike-1");
    advance(sim, 1.2, IDLE_CONTROLS);
    sim.interact();
    expect(sim.mountedId).toBeNull();
    const dist = Math.hypot(sim.player.x - v.state.x, sim.player.z - v.state.z);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(3);
  });

  it("xe không người lái tự phanh đến dừng", () => {
    const sim = new SandboxSim();
    const v = sim.vehicles.find((x) => x.id === "motorbike-1")!;
    v.state = { ...v.state, speed: 10 };
    advance(sim, 5, IDLE_CONTROLS);
    expect(v.state.speed).toBe(0);
  });

  it("áp cooldown khi bấm lên/xuống liên tục", () => {
    const sim = new SandboxSim();
    mountVehicle(sim, "bicycle-1");
    sim.interact();
    expect(sim.mountedId).toBe("bicycle-1");
  });
});

describe("SandboxSim: lái xe", () => {
  it("ô tô trên đường đạt gần tốc độ tối đa", () => {
    const sim = new SandboxSim();
    mountVehicle(sim, "car-1");
    advance(sim, 15, controls({ moveZ: 1 }));
    const v = sim.mountedVehicle!;
    expect(sim.surface === "road" || sim.surface === "pedestrian").toBe(true);
    expect(v.state.speed).toBeLessThanOrEqual(VEHICLE_DEFAULTS.car.handling.maxSpeed + 1e-9);
  });

  it("không xuống sông: xe dừng ở bờ khi đâm vào mép nước", () => {
    const sim = new SandboxSim();
    const v = sim.vehicles.find((x) => x.id === "car-2")!;
    v.state = { x: 60, z: 30, rotY: Math.PI / 2, speed: 0, steer: 0 };
    sim.player = { x: 59, z: 30, rotY: 0, movementState: 0 };
    advance(sim, 1, IDLE_CONTROLS);
    sim.interact();
    advance(sim, 15, controls({ moveZ: 1 }));
    expect(v.state.x).toBeLessThan(WATER.minX);
    expect(sim.collisions).toBeGreaterThan(0);
  });

  it("xe qua cầu được dọc đường |z| < 6", () => {
    const sim = new SandboxSim();
    const v = sim.vehicles.find((x) => x.id === "motorbike-1")!;
    v.state = { x: 60, z: 0, rotY: Math.PI / 2, speed: 0, steer: 0 };
    sim.player = { x: 59, z: 0, rotY: 0, movementState: 0 };
    advance(sim, 1, IDLE_CONTROLS);
    sim.interact();
    advance(sim, 12, controls({ moveZ: 1 }));
    expect(v.state.x).toBeGreaterThan(WATER.maxX);
  });

  it("focus bám theo xe khi đang lái và theo người khi đi bộ", () => {
    const sim = new SandboxSim();
    expect(sim.focus.x).toBe(sim.player.x);
    mountVehicle(sim, "bicycle-1");
    advance(sim, 1, controls({ moveZ: 1 }));
    expect(sim.focus.x).toBe(sim.mountedVehicle!.state.x);
    expect(sim.focus.speed).toBeGreaterThan(0);
  });
});
