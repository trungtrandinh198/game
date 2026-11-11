import { describe, expect, it } from "vitest";
import { createCollisionWorld, pathBlocked, segmentsIntersect } from "./collision";

describe("segmentsIntersect / pathBlocked", () => {
  it("nhận diện hai đoạn cắt nhau và không cắt", () => {
    expect(segmentsIntersect([0, 0, 10, 10], [0, 10, 10, 0])).toBe(true);
    expect(segmentsIntersect([0, 0, 10, 0], [0, 5, 10, 5])).toBe(false);
    expect(segmentsIntersect([0, 0, 4, 0], [6, -1, 6, 1])).toBe(false);
  });

  it("pathBlocked phát hiện tường nằm giữa hai điểm", () => {
    const world = createCollisionWorld([[5, -10, 5, 10]], 8);
    expect(pathBlocked(world, 0, 0, 10, 0)).toBe(true);
    expect(pathBlocked(world, 0, 0, 4, 0)).toBe(false);
    expect(pathBlocked(world, 6, 0, 20, 0)).toBe(false);
  });
});
