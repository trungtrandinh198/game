import type { Redis } from "ioredis";

export interface RateLimitStore {
  /** Tăng bộ đếm của `key` trong cửa sổ `windowMs`; trả số lần đã dùng và thời gian còn lại (ms). */
  hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  ping?(): Promise<boolean>;
  close?(): Promise<void>;
}

/** Dùng cho test và dev khi không có Redis; không chia sẻ giữa nhiều tiến trình. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, windowMs: number) {
    const t = this.now();
    let e = this.entries.get(key);
    if (!e || e.resetAt <= t) {
      e = { count: 0, resetAt: t + windowMs };
      this.entries.set(key, e);
      if (this.entries.size > 50_000) this.sweep(t);
    }
    e.count++;
    return { count: e.count, ttlMs: e.resetAt - t };
  }

  async ping() {
    return true;
  }

  clear() {
    this.entries.clear();
  }

  private sweep(t: number) {
    for (const [k, v] of this.entries) if (v.resetAt <= t) this.entries.delete(k);
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number) {
    const k = `dnw:rl:${key}`;
    const results = await this.redis.multi().incr(k).pttl(k).exec();
    const count = Number(results?.[0]?.[1] ?? 1);
    let ttl = Number(results?.[1]?.[1] ?? -1);
    if (ttl < 0) {
      await this.redis.pexpire(k, windowMs);
      ttl = windowMs;
    }
    return { count, ttlMs: ttl };
  }

  async ping() {
    return (await this.redis.ping()) === "PONG";
  }

  async close() {
    this.redis.disconnect();
  }
}
