import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import { uuidv7 } from "uuidv7";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Writable } from "node:stream";
import type { AppContext } from "./context";
import { registerErrorHandling } from "./plugins/error-handler";
import { registerSecurity } from "./plugins/security";
import { authRoutes } from "./modules/auth/routes";
import { avatarRoutes } from "./modules/avatars/routes";
import { playerRoutes } from "./modules/player/routes";
import { worldRoutes } from "./modules/world/routes";
import { devMailboxRoutes } from "./modules/dev/routes";
import { MemoryMailer } from "./lib/mailer";
import { systemRoutes } from "./modules/system/routes";

export const API_PREFIX = "/api/v1";
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export interface BuildAppOptions {
  /** Ghi log vào luồng này thay vì stdout (test kiểm tra log không lộ bí mật). */
  logStream?: Writable;
}

const REDACT = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  'req.headers["x-dnw-csrf"]',
  "*.password",
  "*.token",
];

export async function buildApp(
  ctx: AppContext,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: ctx.config.LOG_LEVEL,
      redact: { paths: REDACT, censor: "[redacted]" },
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
    genReqId: (req) => {
      const given = req.headers["x-request-id"];
      return typeof given === "string" && REQUEST_ID.test(given) ? given : uuidv7();
    },
    trustProxy: ctx.config.TRUST_PROXY,
    bodyLimit: 100 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("ctx", ctx);

  await app.register(swagger, {
    openapi: {
      info: { title: "Da Nang World API", version: "1.0.0" },
      servers: [{ url: API_PREFIX }],
      components: {
        securitySchemes: {
          cookieAuth: { type: "apiKey", in: "cookie", name: ctx.config.SESSION_COOKIE_NAME },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
  });

  registerErrorHandling(app);
  registerSecurity(app);

  await app.register(systemRoutes);
  await app.register(authRoutes, { prefix: API_PREFIX });
  await app.register(playerRoutes, { prefix: API_PREFIX });
  await app.register(avatarRoutes, { prefix: API_PREFIX });
  await app.register(worldRoutes, { prefix: API_PREFIX });
  if (ctx.mailer instanceof MemoryMailer && ctx.config.NODE_ENV !== "production") {
    await app.register(devMailboxRoutes, { mailer: ctx.mailer });
  }

  return app;
}
