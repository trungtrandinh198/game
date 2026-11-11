import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, RUN_SPEED, TICK_DT, WALK_SPEED } from "@dnw/game-config";
import { createCollisionWorld, resolveCircle, type Segment } from "../collision/collision";
import { stepPlayer, type PlayerSimState } from "./stepPlayer";

const origin: PlayerSimState = { x: 0, z: 0, rotY: 0 };
const input = (over: Partial<Parameters<typeof stepPlayer>[1]> = {}) => ({
  moveX: 0,
  moveZ: 0,
  run: false,
  yaw: 0,
  ...over,
});

describe("stepPlayer", () => {
  it("đứng yên khi không có input", () => {
    const r = stepPlayer(origin, input(), TICK_DT);
    expect(r).toMatchObject({ x: 0, z: 0, movementState: 0 });
  });

  it("đi bộ tiến theo +Z khi yaw = 0", () => {
    const r = stepPlayer(origin, input({ moveZ: 1 }), TICK_DT);
    expect(r.x).toBeCloseTo(0);
    expect(r.z).toBeCloseTo(WALK_SPEED * TICK_DT);
    expect(r.movementState).toBe(1);
    expect(r.rotY).toBeCloseTo(0);
  });

  it("chạy nhanh hơn đi bộ", () => {
    const r = stepPlayer(origin, input({ moveZ: 1, run: true }), TICK_DT);
    expect(r.z).toBeCloseTo(RUN_SPEED * TICK_DT);
    expect(r.movementState).toBe(2);
  });

  it("phải là -X khi nhìn về +Z", () => {
    const r = stepPlayer(origin, input({ moveX: 1 }), TICK_DT);
    expect(r.x).toBeLessThan(0);
    expect(r.z).toBeCloseTo(0);
  });

  it("yaw = π/2 làm tiến về +X", () => {
    const r = stepPlayer(origin, input({ moveZ: 1, yaw: Math.PI / 2 }), TICK_DT);
    expect(r.x).toBeCloseTo(WALK_SPEED * TICK_DT);
    expect(r.z).toBeCloseTo(0);
    expect(r.rotY).toBeCloseTo(Math.PI / 2);
  });

  it("đi chéo không nhanh hơn đi thẳng", () => {
    const r = stepPlayer(origin, input({ moveX: 1, moveZ: 1 }), TICK_DT);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(WALK_SPEED * TICK_DT);
  });

  it("input analog nhỏ hơn 1 đi chậm hơn", () => {
    const r = stepPlayer(origin, input({ moveZ: 0.5 }), TICK_DT);
    expect(r.z).toBeCloseTo(0.5 * WALK_SPEED * TICK_DT);
  });

  it("input vô lý không vượt RUN_SPEED", () => {
    let s: PlayerSimState = origin;
    for (let i = 0; i < 200; i++) {
      const r = stepPlayer(s, input({ moveX: 100, moveZ: 100, run: true }), TICK_DT);
      expect(Math.hypot(r.x - s.x, r.z - s.z)).toBeLessThanOrEqual(RUN_SPEED * TICK_DT + 1e-9);
      s = r;
    }
  });

  it("bỏ qua NaN và Infinity", () => {
    const r = stepPlayer(origin, input({ moveX: NaN, moveZ: Infinity, yaw: NaN }), TICK_DT);
    expect(Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.rotY)).toBe(true);
  });

  describe("va chạm", () => {
    const wall: Segment = [5, -50, 5, 50];
    const collision = createCollisionWorld([wall], 8);

    it("không xuyên tường và đứng cách tường đúng bán kính", () => {
      let s: PlayerSimState = { x: 0, z: 0, rotY: 0 };
      for (let i = 0; i < 300; i++) {
        s = stepPlayer(s, input({ moveZ: 1, yaw: Math.PI / 2, run: true }), TICK_DT, { collision });
      }
      expect(s.x).toBeLessThanOrEqual(5 - PLAYER_RADIUS + 1e-6);
      expect(s.x).toBeGreaterThan(5 - PLAYER_RADIUS - 0.01);
    });

    it("trượt dọc tường: thành phần song song vẫn tiến", () => {
      let s: PlayerSimState = { x: 5 - PLAYER_RADIUS, z: 0, rotY: 0 };
      for (let i = 0; i < 20; i++) {
        // hướng (+X, +Z): đâm vào tường nhưng phải trượt theo +Z
        s = stepPlayer(s, input({ moveZ: 1, yaw: Math.PI / 4 }), TICK_DT, { collision });
      }
      expect(s.x).toBeLessThanOrEqual(5 - PLAYER_RADIUS + 1e-6);
      expect(s.z).toBeGreaterThan(1);
    });
  });

  describe("biên", () => {
    const inBounds = (x: number, z: number) => x <= 10 && z <= 10 && x >= -10 && z >= -10;

    it("không đi ra ngoài biên", () => {
      let s: PlayerSimState = origin;
      for (let i = 0; i < 400; i++) {
        s = stepPlayer(s, input({ moveZ: 1, yaw: Math.PI / 2, run: true }), TICK_DT, { inBounds });
      }
      expect(s.x).toBeLessThanOrEqual(10);
    });

    it("trượt dọc biên khi đi chéo", () => {
      let s: PlayerSimState = { x: 9.9, z: 0, rotY: 0 };
      for (let i = 0; i < 20; i++) {
        s = stepPlayer(s, input({ moveZ: 1, yaw: Math.PI / 4 }), TICK_DT, { inBounds });
      }
      expect(s.x).toBeLessThanOrEqual(10);
      expect(s.z).toBeGreaterThan(0);
    });

    it("đứng yên khi cả hai hướng đều ra ngoài biên (góc)", () => {
      const corner = (x: number, z: number) => x <= 0 && z <= 0;
      const r = stepPlayer(
        { x: 0, z: 0, rotY: 0 },
        input({ moveZ: 1, yaw: Math.PI / 4 }),
        TICK_DT,
        { inBounds: corner },
      );
      expect(r).toMatchObject({ x: 0, z: 0, movementState: 0 });
    });
  });
});

describe("resolveCircle", () => {
  it("đẩy ra khi tâm nằm đúng trên đoạn thẳng", () => {
    const world = createCollisionWorld([[0, -5, 0, 5]], 8);
    const r = resolveCircle(world, 0, 0, 0.5);
    expect(r.hit).toBe(true);
    expect(Math.hypot(r.x, r.z)).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it("xử lý đoạn thẳng suy biến thành điểm", () => {
    const world = createCollisionWorld([[1, 1, 1, 1]], 8);
    const r = resolveCircle(world, 1.2, 1, 0.5);
    expect(r.hit).toBe(true);
    expect(Math.hypot(r.x - 1, r.z - 1)).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it("không va chạm khi ở xa", () => {
    const world = createCollisionWorld([[0, -5, 0, 5]], 8);
    expect(resolveCircle(world, 3, 0, 0.5).hit).toBe(false);
  });

  it("chuẩn hóa pháp tuyến", () => {
    const world = createCollisionWorld([[0, -5, 0, 5]], 8);
    const r = resolveCircle(world, 0.2, 0, 0.5);
    expect(Math.hypot(r.nx, r.nz)).toBeCloseTo(1);
    expect(r.nx).toBeGreaterThan(0.9);
  });
});

describe("createCollisionWorld", () => {
  it("chỉ trả đoạn thẳng ở gần và không trùng lặp", () => {
    const world = createCollisionWorld(
      [
        [0, 0, 100, 0],
        [500, 500, 510, 500],
      ],
      8,
    );
    const found = world.querySegments(40, 0, 20);
    expect(found).toHaveLength(1);
    expect(world.querySegments(1000, 1000, 5)).toHaveLength(0);
  });
});
