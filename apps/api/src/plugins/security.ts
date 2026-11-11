import type { FastifyInstance } from "fastify";
import { Errors } from "../errors";
import { enforceRateLimits, LIMITS } from "../lib/rate-limit";
import { resolveSession } from "../modules/auth/service";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_PATHS = new Set(["/healthz", "/readyz"]);

/** CSRF, giới hạn tốc độ chung và đọc session từ cookie (mục 9.7, 9.9). */
export function registerSecurity(app: FastifyInstance): void {
  const { config } = app.ctx;

  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req) => {
    if (!UNSAFE.has(req.method)) return;
    // Origin phải khớp chính xác; header tùy chỉnh buộc trình duyệt kiểm tra CORS preflight.
    if (req.headers.origin !== config.appOrigin || req.headers["x-dnw-csrf"] !== "1") {
      throw Errors.csrf();
    }
  });

  app.addHook("onRequest", async (req) => {
    if (PUBLIC_PATHS.has(req.url)) return;
    await enforceRateLimits(app.ctx, [{ name: "ip", key: req.ip, ...LIMITS.defaultPerIp }]);
  });

  app.addHook("onRequest", async (req) => {
    const token = req.cookies[config.SESSION_COOKIE_NAME];
    if (!token) return;
    const s = await resolveSession(app.ctx, token);
    if (!s) return;
    req.auth = {
      sessionId: s.sessionId,
      userId: s.userId,
      status: s.status,
      emailVerified: s.emailVerifiedAt !== null,
      displayName: s.displayName,
      locale: s.locale,
    };
  });
}
