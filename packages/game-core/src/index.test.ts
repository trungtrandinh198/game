import { describe, expect, it } from "vitest";
import { forwardVector } from "./index";

describe("forwardVector", () => {
  it("rotY = 0 hướng +Z", () => {
    const v = forwardVector(0);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(1);
  });

  it("rotY = π/2 hướng +X", () => {
    const v = forwardVector(Math.PI / 2);
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });
});
