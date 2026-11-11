import type { Database } from "@dnw/db";
import type { Redis } from "ioredis";
import type { Config } from "./config";
import type { Mailer } from "./lib/mailer";
import type { RateLimitStore } from "./lib/rate-limit-store";

export interface AppContext {
  config: Config;
  db: Database;
  mailer: Mailer;
  rateStore: RateLimitStore;
  /** Kiểm tra kết nối DB cho /readyz. */
  pingDb: () => Promise<boolean>;
  /** Redis cho pub/sub moderation events (null khi dev không có Redis). */
  redis: Redis | null;
}

export interface AuthContext {
  sessionId: string;
  userId: string;
  status: string;
  emailVerified: boolean;
  displayName: string;
  locale: "vi" | "en";
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
