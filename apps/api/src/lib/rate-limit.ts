import type { AppContext } from "../context";
import { RateLimitedError } from "../errors";

export interface RateRule {
  /** Tên nhóm giới hạn, dùng làm tiền tố khóa. */
  name: string;
  /** Định danh bị giới hạn (IP, user, email...). */
  key: string;
  max: number;
  windowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Bảng giới hạn ở mục 9.9. */
export const LIMITS = {
  loginPerIpEmail: { max: 10, windowMs: 15 * MINUTE },
  loginPerIp: { max: 50, windowMs: 15 * MINUTE },
  registerPerIp: { max: 5, windowMs: HOUR },
  mailPerIp: { max: 5, windowMs: HOUR },
  mailPerEmail: { max: 3, windowMs: HOUR },
  joinPerUser: { max: 20, windowMs: MINUTE },
  reportsPerUser: { max: 10, windowMs: HOUR },
  adminPerUser: { max: 120, windowMs: MINUTE },
  defaultPerIp: { max: 120, windowMs: MINUTE },
} as const;

/** Tăng bộ đếm của mọi luật; vượt luật nào thì ném RATE_LIMITED (429) kèm Retry-After. */
export async function enforceRateLimits(ctx: AppContext, rules: RateRule[]): Promise<void> {
  for (const rule of rules) {
    const { count, ttlMs } = await ctx.rateStore.hit(`${rule.name}:${rule.key}`, rule.windowMs);
    if (count > rule.max * ctx.config.RATE_LIMIT_SCALE) {
      throw new RateLimitedError(Math.max(1, Math.ceil(ttlMs / 1000)));
    }
  }
}
