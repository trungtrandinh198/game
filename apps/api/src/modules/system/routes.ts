import type { FastifyPluginAsync } from "fastify";

/** Kiểm tra sống và sẵn sàng; /readyz kiểm tra DB và Redis (hoặc bộ đếm trong bộ nhớ). */
export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get("/healthz", { schema: { hide: true } }, async () => ({ status: "ok" }));

  app.get("/readyz", { schema: { hide: true } }, async (_req, reply) => {
    const [db, redis] = await Promise.all([
      app.ctx.pingDb().catch(() => false),
      (app.ctx.rateStore.ping?.() ?? Promise.resolve(true)).catch(() => false),
    ]);
    const ok = db && redis;
    return reply.status(ok ? 200 : 503).send({ status: ok ? "ready" : "unavailable", db, redis });
  });
};
