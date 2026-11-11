import { createDb, createPool, loadEnv } from "@dnw/db";
import { Redis } from "ioredis";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import type { AppContext } from "./context";
import { createSmtpMailer, MemoryMailer } from "./lib/mailer";
import { MemoryRateLimitStore, RedisRateLimitStore } from "./lib/rate-limit-store";

loadEnv();
const config = loadConfig();

const pool = createPool(config.DATABASE_URL, { max: 10 });
const redis = config.REDIS_URL
  ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false })
  : null;
redis?.on("error", () => undefined);

const ctx: AppContext = {
  config,
  db: createDb(pool),
  mailer: config.SMTP_URL
    ? createSmtpMailer(config.SMTP_URL, config.EMAIL_FROM)
    : new MemoryMailer(),
  rateStore: redis ? new RedisRateLimitStore(redis) : new MemoryRateLimitStore(),
  pingDb: async () => {
    await pool.query("select 1");
    return true;
  },
};

if (!redis)
  console.warn(
    "REDIS_URL chưa đặt: giới hạn tốc độ dùng bộ nhớ trong tiến trình (chỉ dùng cho dev).",
  );
if (!config.SMTP_URL) console.warn("SMTP_URL chưa đặt: thư không được gửi đi.");

const app = await buildApp(ctx);

const shutdown = async () => {
  await app.close();
  await pool.end();
  redis?.disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
