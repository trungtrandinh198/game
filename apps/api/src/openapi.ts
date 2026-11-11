import { buildApp } from "./app";
import { loadConfig } from "./config";
import { MemoryMailer } from "./lib/mailer";
import { MemoryRateLimitStore } from "./lib/rate-limit-store";

/** Dựng app không kết nối DB để xuất OpenAPI; mọi route chỉ cần schema. */
export async function generateOpenApi(): Promise<string> {
  const app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      APP_BASE_URL: "http://localhost:3000",
      DATABASE_URL: "unused",
      LOG_LEVEL: "silent",
    }),
    db: {} as never,
    mailer: new MemoryMailer(),
    rateStore: new MemoryRateLimitStore(),
    pingDb: async () => true,
    redis: null,
  });
  await app.ready();
  const doc = app.swagger();
  await app.close();
  return `${JSON.stringify(doc, null, 2)}\n`;
}
