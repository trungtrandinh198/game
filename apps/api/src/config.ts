import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_BASE_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().min(1).default("dnw_sid"),
  SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(14),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().int().positive().default(30),
  REQUIRE_EMAIL_VERIFICATION: bool.default(false),
  REALTIME_TICKET_SECRET: z.string().min(32).optional(),
  REALTIME_PUBLIC_URL: z.string().optional(),
  PROTOCOL_VERSION: z.coerce.number().int().positive().default(1),
  SMTP_URL: z.string().optional(),
  CDN_BASE_URL: z.string().default("http://localhost:9000/dnw-assets"),
  EMAIL_FROM: z.string().default("Da Nang World <no-reply@localhost>"),
  TRUST_PROXY: bool.default(false),
  IP_HASH_SECRET: z.string().min(16).optional(),
  /** Nhân hệ số cho mọi ngưỡng giới hạn tốc độ (chỉ dùng cho e2e/dev); mặc định 1. */
  RATE_LIMIT_SCALE: z.coerce.number().positive().default(1),
});

export type Config = Omit<z.infer<typeof schema>, "APP_BASE_URL"> & {
  APP_BASE_URL: string;
  /** Origin (không có đường dẫn) dùng để so với header Origin khi kiểm tra CSRF. */
  appOrigin: string;
  cookieSecure: boolean;
};

/** Đọc cấu hình; thiếu hoặc sai thì ném lỗi liệt kê tên biến, không in giá trị. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Cấu hình không hợp lệ: ${issues}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === "production" && !c.REALTIME_TICKET_SECRET) {
    throw new Error("Cấu hình không hợp lệ: REALTIME_TICKET_SECRET bắt buộc ở production");
  }
  const url = new URL(c.APP_BASE_URL);
  return {
    ...c,
    APP_BASE_URL: c.APP_BASE_URL.replace(/\/$/, ""),
    appOrigin: url.origin,
    cookieSecure: url.protocol === "https:" || c.NODE_ENV === "production",
  };
}
