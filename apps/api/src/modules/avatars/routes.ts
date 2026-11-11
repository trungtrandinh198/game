import { avatarSchema, errorResponseSchema } from "@dnw/schemas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { cdnUrl } from "../../lib/cdn";
import * as repo from "./repo";

export const avatarRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/avatars",
    {
      schema: {
        tags: ["avatars"],
        summary: "Danh mục nhân vật đang bật (công khai)",
        response: { 200: z.object({ items: z.array(avatarSchema) }), 429: errorResponseSchema },
      },
    },
    async (_req, reply) => {
      const rows = await repo.listActiveAvatars(app.ctx.db);
      const base = app.ctx.config.CDN_BASE_URL;
      reply.header("cache-control", "public, max-age=60");
      return {
        items: rows.map(({ modelKey, thumbnailKey, gender, ...rest }) => ({
          ...rest,
          gender: gender as "male" | "female",
          modelUrl: cdnUrl(base, modelKey),
          thumbnailUrl: cdnUrl(base, thumbnailKey),
        })),
      };
    },
  );
};
