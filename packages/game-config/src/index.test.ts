import { describe, expect, it } from "vitest";
import { RUN_SPEED, TICK_DT, TICK_RATE_HZ, WALK_SPEED } from "./index";

describe("game-config", () => {
  it("giữ tick 20 Hz khớp với dt", () => {
    expect(TICK_DT * TICK_RATE_HZ).toBeCloseTo(1);
  });

  it("chạy nhanh hơn đi bộ", () => {
    expect(RUN_SPEED).toBeGreaterThan(WALK_SPEED);
  });
});
