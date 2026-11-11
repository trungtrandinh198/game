import { describe, expect, it } from "vitest";
import { SnapshotBuffer, lerpAngle, type Sample } from "./snapshot";

const s = (t: number, x: number, rotY = 0, speed = 0): Sample => ({
  t,
  x,
  z: 0,
  rotY,
  speed,
  steer: 0,
});

describe("lerpAngle", () => {
  it("đi theo cung ngắn qua đường nối ±π", () => {
    const mid = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.cos(mid) + 1)).toBeLessThan(1e-6);
  });

  it("t = 0 và t = 1 cho hai đầu", () => {
    expect(lerpAngle(0.3, 1.2, 0)).toBeCloseTo(0.3);
    expect(lerpAngle(0.3, 1.2, 1)).toBeCloseTo(1.2);
  });
});

describe("SnapshotBuffer", () => {
  it("rỗng thì trả null", () => {
    expect(new SnapshotBuffer().sample(10)).toBeNull();
  });

  it("nội suy tuyến tính giữa hai mẫu", () => {
    const b = new SnapshotBuffer();
    b.push(s(100, 0, 0, 0));
    b.push(s(200, 10, 1, 4));
    const mid = b.sample(150)!;
    expect(mid.x).toBeCloseTo(5);
    expect(mid.rotY).toBeCloseTo(0.5);
    expect(mid.speed).toBeCloseTo(2);
  });

  it("trước mẫu đầu giữ mẫu đầu, sau mẫu cuối giữ mẫu cuối", () => {
    const b = new SnapshotBuffer();
    b.push(s(100, 1));
    b.push(s(200, 9));
    expect(b.sample(0)!.x).toBe(1);
    expect(b.sample(1000)!.x).toBe(9);
  });

  it("chọn đúng cặp mẫu khi có nhiều mẫu", () => {
    const b = new SnapshotBuffer();
    for (let i = 0; i < 5; i++) b.push(s(i * 50, i * 10));
    expect(b.sample(125)!.x).toBeCloseTo(25);
  });

  it("bỏ mẫu cũ hơn hoặc bằng mẫu cuối, giữ tối đa `capacity` mẫu", () => {
    const b = new SnapshotBuffer(3);
    b.push(s(100, 1));
    b.push(s(100, 2));
    b.push(s(90, 3));
    expect(b.size).toBe(1);
    for (let i = 1; i <= 10; i++) b.push(s(100 + i, i));
    expect(b.size).toBe(3);
    expect(b.latest?.x).toBe(10);
  });
});
