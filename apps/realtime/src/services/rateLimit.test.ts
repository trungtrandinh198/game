import { describe, expect, it } from "vitest";
import { RateLimiter, ViolationCounter } from "./rateLimit";

describe("RateLimiter", () => {
  it("cho qua, bỏ, rồi đá theo ngưỡng trong cửa sổ 1 giây", () => {
    const limiter = new RateLimiter(3, 5);
    const verdicts = Array.from({ length: 7 }, () => limiter.hit(1000));
    expect(verdicts).toEqual(["ok", "ok", "ok", "drop", "drop", "kick", "kick"]);
  });

  it("cửa sổ mới đặt lại bộ đếm", () => {
    const limiter = new RateLimiter(1, 2);
    expect(limiter.hit(0)).toBe("ok");
    expect(limiter.hit(10)).toBe("drop");
    expect(limiter.hit(1100)).toBe("ok");
  });
});

describe("ViolationCounter", () => {
  it("đạt ngưỡng khi đủ vi phạm trong cửa sổ", () => {
    const counter = new ViolationCounter(3, 1000);
    expect(counter.add(0)).toBe(false);
    expect(counter.add(100)).toBe(false);
    expect(counter.add(200)).toBe(true);
  });

  it("vi phạm cũ ngoài cửa sổ không được tính", () => {
    const counter = new ViolationCounter(3, 1000);
    counter.add(0);
    counter.add(100);
    expect(counter.add(5000)).toBe(false);
  });
});
