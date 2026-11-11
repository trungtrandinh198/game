import { vehicleTypeListSchema, type VehicleTypeDto } from "@dnw/schemas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { eq } from "drizzle-orm";
import { vehicleTypes } from "@dnw/db";
import type { AppContext } from "../../context";
import { cdnUrl } from "../../lib/cdn";

function toDto(ctx: AppContext, row: typeof vehicleTypes.$inferSelect): VehicleTypeDto {
  return {
    code: row.code,
    kind: row.kind as VehicleTypeDto["kind"],
    modelUrl: cdnUrl(ctx.config.CDN_BASE_URL, row.modelKey),
    thumbnailUrl: row.thumbnailKey ? cdnUrl(ctx.config.CDN_BASE_URL, row.thumbnailKey) : null,
    config: row.config,
    contentVersion: row.contentVersion,
  };
}

export const vehicleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/vehicle-types",
    {
      schema: {
        tags: ["vehicles"],
        summary: "Danh sách loại phương tiện đang bật (công khai)",
        response: { 200: vehicleTypeListSchema },
      },
    },
    async (_req, reply) => {
      reply.header("cache-control", "public, max-age=60");
      const rows = await app.ctx.db
        .select()
        .from(vehicleTypes)
        .where(eq(vehicleTypes.isActive, true))
        .orderBy(vehicleTypes.sortOrder);
      return { items: rows.map((r) => toDto(app.ctx, r)) };
    },
  );
};
