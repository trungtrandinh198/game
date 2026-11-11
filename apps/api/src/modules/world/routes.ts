import { errorResponseSchema, joinBodySchema, joinResponseSchema, zoneListSchema, zoneSchema, type ZoneDto } from "@dnw/schemas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../../context";
import { Errors } from "../../errors";
import { cdnUrl } from "../../lib/cdn";
import { enforceRateLimits, LIMITS } from "../../lib/rate-limit";
import { requireAuth } from "../../plugins/auth";
import * as repo from "./repo";
import * as service from "./service";

export function toZoneDto(
  ctx: AppContext,
  z: Awaited<ReturnType<typeof repo.listOpenZones>>[number],
): ZoneDto {
  return {
    code: z.code,
    name: z.name,
    mapVersion: z.mapVersion,
    chunkSizeM: z.chunkSizeM,
    crs: z.crs,
    origin: { lon: z.originLon, lat: z.originLat },
    indexUrl: cdnUrl(ctx.config.CDN_BASE_URL, `zones/${z.code}/v${z.mapVersion}/index.json`),
  };
}

export const worldRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/world/join",
    {
      schema: {
        tags: ["world"],
        summary: "Xin vào thế giới: cấp ticket 60 giây cho realtime",
        body: joinBodySchema,
        response: {
          200: joinResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          412: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (req) => {
      const auth = requireAuth(req);
      await enforceRateLimits(app.ctx, [{ name: "join:user", key: auth.userId, ...LIMITS.joinPerUser }]);
      return service.join(app.ctx, auth, req.body.zoneCode);
    },
  );

  app.get(
    "/world/zones",
    {
      schema: {
        tags: ["world"],
        summary: "Danh sách khu vực đang mở (công khai)",
        response: { 200: zoneListSchema, 429: errorResponseSchema },
      },
    },
    async (_req, reply) => {
      reply.header("cache-control", "public, max-age=30");
      return { items: (await repo.listOpenZones(app.ctx.db)).map((z) => toZoneDto(app.ctx, z)) };
    },
  );

  app.get(
    "/world/zones/:code",
    {
      schema: {
        tags: ["world"],
        summary: "Metadata khu vực và URL index chunk",
        params: z.object({ code: z.string().min(2).max(80) }),
        response: { 200: zoneSchema, 404: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (req, reply) => {
      const zone = await repo.findOpenZone(app.ctx.db, req.params.code);
      if (!zone) throw Errors.notFound();
      reply.header("cache-control", "public, max-age=30");
      return toZoneDto(app.ctx, zone);
    },
  );
};
