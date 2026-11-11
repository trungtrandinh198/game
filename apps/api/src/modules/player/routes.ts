import {
  characterSchema,
  createCharacterBodySchema,
  errorResponseSchema,
  profileSchema,
  progressSchema,
  updateCharacterBodySchema,
  updateProfileBodySchema,
} from "@dnw/schemas";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../plugins/auth";
import * as service from "./service";

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  429: errorResponseSchema,
};

export const playerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/player/profile",
    {
      schema: {
        tags: ["player"],
        summary: "Hồ sơ của tôi",
        response: { 200: profileSchema, ...errors },
      },
    },
    async (req) => service.getProfile(app.ctx, requireAuth(req).userId),
  );

  app.patch(
    "/player/profile",
    {
      schema: {
        tags: ["player"],
        summary: "Cập nhật hồ sơ",
        body: updateProfileBodySchema,
        response: { 200: profileSchema, ...errors },
      },
    },
    async (req) => service.updateProfile(app.ctx, requireAuth(req).userId, req.body),
  );

  app.get(
    "/player/characters",
    {
      schema: {
        tags: ["player"],
        summary: "Nhân vật của tôi (tối đa một)",
        response: { 200: z.object({ items: z.array(characterSchema) }), ...errors },
      },
    },
    async (req) => ({ items: await service.listCharacters(app.ctx, requireAuth(req).userId) }),
  );

  app.post(
    "/player/characters",
    {
      schema: {
        tags: ["player"],
        summary: "Tạo nhân vật; lần hai trả CHARACTER_ALREADY_EXISTS",
        body: createCharacterBodySchema,
        response: { 201: characterSchema, ...errors },
      },
    },
    async (req, reply) => {
      const character = await service.createCharacter(app.ctx, requireAuth(req).userId, req.body);
      return reply.status(201).send(character);
    },
  );

  app.patch(
    "/player/characters/:id",
    {
      schema: {
        tags: ["player"],
        summary: "Đổi avatar hoặc cấu hình nhân vật",
        params: z.object({ id: z.uuid() }),
        body: updateCharacterBodySchema,
        response: { 200: characterSchema, ...errors },
      },
    },
    async (req) =>
      service.updateCharacter(app.ctx, requireAuth(req).userId, req.params.id, req.body),
  );

  app.get(
    "/player/progress",
    {
      schema: {
        tags: ["player"],
        summary: "Tiến trình khám phá",
        response: { 200: progressSchema, ...errors },
      },
    },
    async (req) => service.getProgress(app.ctx, requireAuth(req).userId),
  );
};
