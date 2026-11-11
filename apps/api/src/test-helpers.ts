import { seed } from "@dnw/db";
import { createTestDatabase, type TestDatabase } from "@dnw/db/testing";
import { Writable } from "node:stream";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { MemoryMailer } from "./lib/mailer";
import { MemoryRateLimitStore } from "./lib/rate-limit-store";

export const ORIGIN = "http://localhost:3000";

export interface TestHarness {
  app: FastifyInstance;
  mailer: MemoryMailer;
  store: MemoryRateLimitStore;
  logs: string[];
  t: TestDatabase;
  /** POST/PATCH... kèm Origin và X-DNW-CSRF hợp lệ (ghi đè được qua `headers`). */
  send(
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    body?: unknown,
    opts?: { cookie?: string; headers?: Record<string, string>; ip?: string },
  ): Promise<LightMyRequestResponse>;
  get(
    url: string,
    opts?: { cookie?: string; headers?: Record<string, string>; ip?: string },
  ): Promise<LightMyRequestResponse>;
  /** Xóa dữ liệu người dùng và bộ đếm giữa các test. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createHarness(
  t: TestDatabase,
  env: Record<string, string> = {},
): Promise<TestHarness> {
  const mailer = new MemoryMailer();
  const store = new MemoryRateLimitStore();
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      logs.push(String(chunk));
      cb();
    },
  });
  const config = loadConfig({
    NODE_ENV: "test",
    APP_BASE_URL: ORIGIN,
    DATABASE_URL: "unused",
    LOG_LEVEL: "info",
    ...env,
  });
  const app = await buildApp(
    {
      config,
      db: t.db,
      mailer,
      rateStore: store,
      pingDb: async () => {
        await t.pool.query("select 1");
        return true;
      },
      redis: null,
    },
    { logStream: stream },
  );
  await app.ready();

  const base = (opts: { cookie?: string; headers?: Record<string, string>; ip?: string } = {}) => ({
    headers: { ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
    remoteAddress: opts.ip ?? "10.0.0.1",
  });

  return {
    app,
    mailer,
    store,
    logs,
    t,
    send: (method, url, body, opts) => {
      const b = base(opts);
      return app.inject({
        method,
        url,
        ...(body !== undefined ? { payload: body as object } : {}),
        remoteAddress: b.remoteAddress,
        headers: { origin: ORIGIN, "x-dnw-csrf": "1", ...b.headers },
      });
    },
    get: (url, opts) => {
      const b = base(opts);
      return app.inject({ method: "GET", url, remoteAddress: b.remoteAddress, headers: b.headers });
    },
    async reset() {
      await t.pool.query("TRUNCATE users, avatars CASCADE");
      store.clear();
      mailer.outbox.length = 0;
      logs.length = 0;
    },
    close: () => app.close(),
  };
}

/** Đăng ký + đăng nhập một người dùng, trả cookie phiên. */
export async function loginAs(
  h: TestHarness,
  user: { email: string; displayName: string; password?: string },
): Promise<string> {
  const password = user.password ?? "correct horse battery";
  await h.send("POST", "/api/v1/auth/register", {
    email: user.email,
    password,
    displayName: user.displayName,
    locale: "vi",
    acceptTerms: true,
  });
  const res = await h.send("POST", "/api/v1/auth/login", { email: user.email, password });
  if (res.statusCode !== 200) throw new Error(`Đăng nhập thất bại: ${res.body}`);
  return cookieFrom(res);
}

export async function insertAvatar(
  t: TestDatabase,
  code: string,
  isActive = true,
): Promise<string> {
  const { rows } = await t.pool.query(
    `insert into avatars (id, code, gender, rig, model_key, thumbnail_key, animation_set, is_active)
     values (gen_random_uuid(), $1, 'male', 'humanoid-v1', $2, $3, 'base', $4) returning id`,
    [code, `characters/${code}/v1/model.glb`, `characters/${code}/v1/thumb.webp`, isActive],
  );
  return rows[0].id as string;
}

export async function createSeededDatabase(): Promise<TestDatabase> {
  const t = await createTestDatabase();
  await seed(t.db);
  return t;
}

/** Lấy token từ liên kết trong thư gần nhất gửi tới `to`. */
export function tokenFromMail(mailer: MemoryMailer, to: string): string {
  const mail = mailer.last(to);
  const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
  const token = url ? new URL(url).searchParams.get("token") : null;
  if (!token) throw new Error(`Không có token trong thư gửi ${to}`);
  return token;
}

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return String(header).split(";")[0]!;
}
