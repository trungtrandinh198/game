export type RateVerdict = "ok" | "drop" | "kick";

/** Cửa sổ cố định 1 giây: vượt `maxPerSecond` thì bỏ, vượt `kickPerSecond` thì đá (mục 8.12). */
export class RateLimiter {
  private windowStart = 0;
  private count = 0;

  constructor(
    private readonly maxPerSecond: number,
    private readonly kickPerSecond: number,
  ) {}

  hit(nowMs: number): RateVerdict {
    if (nowMs - this.windowStart >= 1000) {
      this.windowStart = nowMs;
      this.count = 0;
    }
    this.count++;
    if (this.count > this.kickPerSecond) return "kick";
    if (this.count > this.maxPerSecond) return "drop";
    return "ok";
  }
}

/** Đếm vi phạm trong cửa sổ trượt; trả true khi đạt ngưỡng. */
export class ViolationCounter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  add(nowMs: number): boolean {
    this.stamps.push(nowMs);
    while (this.stamps.length > 0 && nowMs - (this.stamps[0] ?? nowMs) > this.windowMs)
      this.stamps.shift();
    return this.stamps.length >= this.limit;
  }
}
